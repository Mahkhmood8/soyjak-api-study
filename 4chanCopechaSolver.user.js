// ==UserScript==
// @name         4chan TCaptcha ImGui Debugger (Refactored v2)
// @namespace    4chan-imgui-debugger
// @match        https://*.4chan.org/*
// @match        https://*.4channel.org/*
// @require      https://docs.opencv.org/4.x/opencv.js
// @grant        unsafeWindow
// @run-at       document-end
// @version      13.0
// ==/UserScript==

(function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════════
    // CONSTANTS & CONFIGURATION
    // ═══════════════════════════════════════════════════════════════

    const TARGET_WINDOW = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    const CONFIG = Object.freeze({
        UI: Object.freeze({
            WIDTH: 550,
            COLORS: Object.freeze({
                PRIMARY: '#007acc',
                PREDICT: '#ff3e3e',
                BG_DARK: '#1e1e1e',
                BG_HEADER: '#252526',
                BG_LOG: '#000000',
                BG_CARD: '#2d2d2d',
                BG_PREDICTED: '#452121',
                BORDER: '#333',
                BORDER_CARD: '#444',
                TEXT: '#eee',
                TEXT_MUTED: '#888',
                TEXT_SUCCESS: '#6a9955',
                TEXT_LOG: '#b5cea8'
            })
        }),
        CV: Object.freeze({
            MORPH_KERNEL: 5,
            BLOCK_SIZE: 11,
            THRESH_C: 2,
            MIN_AREA: 100,
            APPROX_EPSILON: 0.04,
            ANGLE_TOLERANCE: 15,        // degrees from 90
            EROSION_FACTOR: 0.1,
            INK_INTENSITY: 100,
            EMPTY_THRESHOLD: 0.015,     // fill ratio below this = empty
            NMS_OVERLAP: 0.6            // center distance threshold for NMS
        }),
        TIMING: Object.freeze({
            HOOK_RETRY: 250,
            UPDATE_DELAY: 150
        })
    });

    const LogicType = Object.freeze({
        UNKNOWN: 'UNKNOWN',
        MAX: 'MAX',
        EXACT: 'EXACT'
    });

    // ═══════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════

    const DOM = {
        create(tag, attrs = {}, children = []) {
            const el = document.createElement(tag);
            for (const [k, v] of Object.entries(attrs)) {
                if (k === 'className') el.className = v;
                else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
                else if (k === 'text') el.textContent = v;
                else if (k === 'html') el.innerHTML = v;
                else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
                else el.setAttribute(k, v);
            }
            children.forEach(c => el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
            return el;
        },
        $(id) { return document.getElementById(id); }
    };

    const MathUtils = {
        distance(a, b) {
            return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
        },

        getAngle(p1, p2, p3) {
            // Angle at vertex p2 formed by p1-p2-p3
            const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
            const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };
            const dot = v1.x * v2.x + v1.y * v2.y;
            const mag1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
            const mag2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);
            const cosTheta = dot / (mag1 * mag2 + 1e-7);
            return Math.acos(Math.max(-1, Math.min(1, cosTheta))) * (180 / Math.PI);
        }
    };

    class MatCollector {
        constructor() { this.mats = []; }
        track(...items) { this.mats.push(...items.flat()); return items.length === 1 ? items[0] : items; }
        cleanup() {
            this.mats.forEach(m => {
                try { if (m?.delete && !m.isDeleted?.()) m.delete(); } catch {}
            });
            this.mats = [];
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // BOX DETECTOR (Ported from Python)
    // ═══════════════════════════════════════════════════════════════

    class BoxDetector {
        static get isReady() {
            return typeof cv !== 'undefined' && cv.Mat;
        }

        static analyze(imgElement) {
            if (!this.isReady) return { empty: 0, total: 0, error: 'OpenCV not loaded' };

            const collector = new MatCollector();

            try {
                const { gray, thresh } = this.#preprocess(imgElement, collector);
                const candidates = this.#findCandidates(thresh, collector);
                const boxes = this.#suppressOverlaps(candidates);
                const empty = this.#countEmpty(boxes, gray, collector);

                return { empty, total: boxes.length, error: null };
            } catch (e) {
                return { empty: 0, total: 0, error: e.message };
            } finally {
                collector.cleanup();
            }
        }

        static #preprocess(img, collector) {
            const src = collector.track(cv.imread(img));
            const gray = collector.track(new cv.Mat());
            cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

            // Morphological black-hat transform
            const kernelSize = CONFIG.CV.MORPH_KERNEL;
            const kernel = collector.track(
                cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(kernelSize, kernelSize))
            );
            const blackhat = collector.track(new cv.Mat());
            cv.morphologyEx(gray, blackhat, cv.MORPH_BLACKHAT, kernel);

            // Combined thresholding: Otsu + Adaptive
            const threshOtsu = collector.track(new cv.Mat());
            cv.threshold(blackhat, threshOtsu, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

            const threshAdapt = collector.track(new cv.Mat());
            cv.adaptiveThreshold(
                blackhat, threshAdapt, 255,
                cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY,
                CONFIG.CV.BLOCK_SIZE, CONFIG.CV.THRESH_C
            );

            const thresh = collector.track(new cv.Mat());
            cv.bitwise_and(threshOtsu, threshAdapt, thresh);

            return { gray, thresh };
        }

        static #findCandidates(thresh, collector) {
            const contours = collector.track(new cv.MatVector());
            const hierarchy = collector.track(new cv.Mat());
            cv.findContours(thresh, contours, hierarchy, cv.RETR_TREE, cv.CHAIN_APPROX_SIMPLE);

            const { MIN_AREA, APPROX_EPSILON, ANGLE_TOLERANCE } = CONFIG.CV;
            const candidates = [];

            for (let i = 0; i < contours.size(); i++) {
                const cnt = contours.get(i);
                const area = cv.contourArea(cnt);

                if (area < MIN_AREA) continue;

                const peri = cv.arcLength(cnt, true);
                const approx = new cv.Mat();
                cv.approxPolyDP(cnt, approx, APPROX_EPSILON * peri, true);

                // Must be a quadrilateral
                if (approx.rows !== 4 || !cv.isContourConvex(approx)) {
                    approx.delete();
                    continue;
                }

                // Extract corner points
                const pts = [];
                for (let j = 0; j < 4; j++) {
                    pts.push({ x: approx.data32S[j * 2], y: approx.data32S[j * 2 + 1] });
                }
                approx.delete();

                // Validate angles are ~90 degrees
                const angles = pts.map((_, idx) => {
                    const p1 = pts[(idx + 3) % 4];
                    const p2 = pts[idx];
                    const p3 = pts[(idx + 1) % 4];
                    return MathUtils.getAngle(p1, p2, p3);
                });

                if (!angles.every(a => Math.abs(a - 90) <= ANGLE_TOLERANCE)) continue;

                // Calculate centroid
                const M = cv.moments(cnt);
                if (M.m00 === 0) continue;

                const cx = M.m10 / M.m00;
                const cy = M.m01 / M.m00;
                const rect = cv.boundingRect(cnt);

                candidates.push({
                    contour: cnt,
                    center: { x: cx, y: cy },
                    width: Math.max(rect.width, rect.height),
                    area
                });
            }

            return candidates;
        }

        static #suppressOverlaps(candidates) {
            // Sort by area descending, keep non-overlapping
            candidates.sort((a, b) => b.area - a.area);
            const kept = [];

            for (const box of candidates) {
                const dominated = kept.some(
                    k => MathUtils.distance(box.center, k.center) < k.width * CONFIG.CV.NMS_OVERLAP
                );
                if (!dominated) kept.push(box);
            }

            return kept;
        }

        static #countEmpty(boxes, gray, collector) {
            const { EROSION_FACTOR, INK_INTENSITY, EMPTY_THRESHOLD } = CONFIG.CV;
            let emptyCount = 0;

            for (const box of boxes) {
                // Create mask from contour
                const mask = collector.track(cv.Mat.zeros(gray.rows, gray.cols, cv.CV_8UC1));
                const vec = collector.track(new cv.MatVector());
                vec.push_back(box.contour);
                cv.drawContours(mask, vec, 0, new cv.Scalar(255), -1);

                // Erode to get inner region
                const erosionIters = Math.max(Math.floor(box.width * EROSION_FACTOR), 1);
                const erosionKernel = collector.track(
                    cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3))
                );
                const innerMask = collector.track(new cv.Mat());
                cv.erode(mask, innerMask, erosionKernel, new cv.Point(-1, -1), erosionIters);

                // Calculate mean intensity inside box
                const meanVal = cv.mean(gray, innerMask)[0];
                const threshVal = Math.min(INK_INTENSITY, meanVal - 10);

                // Threshold for ink detection
                const inkThresh = collector.track(new cv.Mat());
                cv.threshold(gray, inkThresh, threshVal, 255, cv.THRESH_BINARY_INV);

                // Count ink pixels in inner region
                const masked = collector.track(new cv.Mat());
                cv.bitwise_and(inkThresh, inkThresh, masked, innerMask);

                const inkPixels = cv.countNonZero(masked);
                const totalPixels = cv.countNonZero(innerMask);
                const fillRatio = totalPixels > 0 ? inkPixels / totalPixels : 0;

                if (fillRatio < EMPTY_THRESHOLD) emptyCount++;
            }

            return emptyCount;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // INSTRUCTION PARSER
    // ═══════════════════════════════════════════════════════════════

    class InstructionParser {
        static parse(html) {
            const cleanText = this.#sanitize(html);
            const type = this.#detectType(cleanText);
            const target = type === LogicType.EXACT ? this.#extractNumber(cleanText, html) : 0;
            return { type, target, cleanText };
        }

        static #sanitize(html) {
            const doc = new DOMParser().parseFromString(html, 'text/html');
            doc.querySelectorAll('*').forEach(el => {
                const s = (el.getAttribute('style') || '').replace(/\s/g, '');
                if (s.includes('display:none') || s.includes('visibility:hidden')) el.remove();
            });
            return doc.body.textContent.toLowerCase().replace(/\s+/g, ' ').trim();
        }

        static #detectType(text) {
            if (text.includes('highest number')) return LogicType.MAX;
            if (text.includes('exactly')) return LogicType.EXACT;
            return LogicType.UNKNOWN;
        }

        static #extractNumber(text, html) {
            const patterns = [
                { src: text, rx: /exactly\s*(\d+)/ },
                { src: html, rx: /exactly.*?(\d+)/i },
                { src: html, rx: />\s*(\d+)\s*</ }
            ];
            for (const { src, rx } of patterns) {
                const m = src.match(rx);
                if (m) return parseInt(m[1], 10);
            }
            return 0;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PREDICTION ENGINE
    // ═══════════════════════════════════════════════════════════════

    class Predictor {
        static calculate(results, logic) {
            switch (logic.type) {
                case LogicType.MAX:
                    return this.#findMax(results);
                case LogicType.EXACT:
                    return this.#findExact(results, logic.target);
                default:
                    return { index: -1, approximate: false };
            }
        }

        static #findMax(results) {
            const sorted = [...results].sort((a, b) => b.empty - a.empty || a.total - b.total);
            return { index: sorted[0]?.empty > 0 ? sorted[0].idx : -1, approximate: false };
        }

        static #findExact(results, target) {
            const exact = results.find(r => r.empty === target);
            if (exact) return { index: exact.idx, approximate: false };

            const closest = [...results].sort(
                (a, b) => Math.abs(a.empty - target) - Math.abs(b.empty - target)
            )[0];
            return { index: closest?.idx ?? -1, approximate: true };
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // STYLES
    // ═══════════════════════════════════════════════════════════════

    class Styles {
        static inject() {
            const { WIDTH, COLORS: C } = CONFIG.UI;
            document.head.appendChild(DOM.create('style', { html: `
                #imgui-root {
                    position: fixed; top: 60px; right: 20px; width: ${WIDTH}px;
                    background: ${C.BG_DARK}; border: 1px solid ${C.BORDER};
                    border-top: 4px solid ${C.PRIMARY};
                    box-shadow: 0 10px 30px rgba(0,0,0,0.8); z-index: 2147483647;
                    font-family: 'Segoe UI', Tahoma, sans-serif; color: ${C.TEXT};
                    display: none;
                }
                .imgui-header {
                    background: ${C.BG_HEADER}; padding: 8px 12px; cursor: move;
                    display: flex; justify-content: space-between;
                    font-size: 12px; font-weight: bold; border-bottom: 1px solid ${C.BORDER};
                    user-select: none;
                }
                .imgui-header span:last-child { cursor: pointer; }
                .imgui-header span:last-child:hover { color: ${C.PREDICT}; }
                .imgui-body { padding: 12px; }
                .imgui-log {
                    background: ${C.BG_LOG}; padding: 10px; font-size: 14px;
                    color: ${C.TEXT_LOG}; border: 1px solid ${C.BORDER_CARD};
                    margin-bottom: 12px; font-family: monospace; border-radius: 2px;
                    word-break: break-word;
                }
                .imgui-grid {
                    display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
                    max-height: 500px; overflow-y: auto; padding-right: 5px;
                }
                .imgui-card {
                    background: ${C.BG_CARD}; border: 2px solid ${C.BORDER_CARD};
                    padding: 6px; cursor: pointer; position: relative; border-radius: 4px;
                    transition: border-color 0.15s, transform 0.1s;
                }
                .imgui-card:hover { transform: scale(1.02); }
                .imgui-card img { width: 100%; display: block; border-radius: 2px; }
                .imgui-card.predicted { border-color: ${C.PREDICT} !important; background: ${C.BG_PREDICTED}; }
                .imgui-badge {
                    position: absolute; top: -8px; left: 50%; transform: translateX(-50%);
                    background: ${C.PREDICT}; color: white; font-size: 9px;
                    padding: 2px 8px; border-radius: 10px; font-weight: bold;
                }
                .imgui-footer {
                    display: flex; justify-content: space-between; margin-top: 4px;
                    font-size: 11px; color: ${C.TEXT_MUTED};
                }
                .imgui-status {
                    margin-top: 12px; font-size: 11px; color: ${C.TEXT_SUCCESS};
                    display: flex; justify-content: space-between;
                    padding-top: 8px; border-top: 1px solid ${C.BORDER};
                }
                .imgui-grid::-webkit-scrollbar { width: 4px; }
                .imgui-grid::-webkit-scrollbar-thumb { background: ${C.BORDER_CARD}; border-radius: 2px; }
            `}));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // DRAGGABLE
    // ═══════════════════════════════════════════════════════════════

    class Draggable {
        constructor(el, handle) {
            this.el = el;
            this.pos = { x: 0, y: 0 };
            this.dragging = false;

            handle.addEventListener('mousedown', e => this.#onDown(e));
            document.addEventListener('mousemove', e => this.#onMove(e));
            document.addEventListener('mouseup', () => this.dragging = false);
        }

        #onDown(e) {
            if (e.target.closest('[id$="-close"]')) return;
            this.dragging = true;
            this.startX = e.clientX - this.pos.x;
            this.startY = e.clientY - this.pos.y;
        }

        #onMove(e) {
            if (!this.dragging) return;
            e.preventDefault();
            this.pos.x = e.clientX - this.startX;
            this.pos.y = e.clientY - this.startY;
            this.el.style.transform = `translate(${this.pos.x}px, ${this.pos.y}px)`;
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // PANEL
    // ═══════════════════════════════════════════════════════════════

    class Panel {
        constructor() {
            this.root = null;
            this.els = {};
        }

        init() {
            Styles.inject();
            this.#build();
            new Draggable(this.root, this.els.header);
            this.els.close.addEventListener('click', () => this.hide());
        }

        #build() {
            this.root = DOM.create('div', { id: 'imgui-root' }, [
                DOM.create('div', { className: 'imgui-header', id: 'imgui-header' }, [
                    DOM.create('span', { text: 'TCAPTCHA DEBUGGER v13' }),
                    DOM.create('span', { id: 'imgui-close', text: '[X]' })
                ]),
                DOM.create('div', { className: 'imgui-body' }, [
                    DOM.create('div', { className: 'imgui-log', id: 'imgui-prompt', text: 'READY' }),
                    DOM.create('div', { className: 'imgui-grid', id: 'imgui-grid' }),
                    DOM.create('div', { className: 'imgui-status' }, [
                        DOM.create('span', { id: 'imgui-logic', text: 'LOGIC: IDLE' }),
                        DOM.create('span', { id: 'imgui-step', text: 'STEP: 0/0' })
                    ])
                ])
            ]);
            document.body.appendChild(this.root);

            this.els = {
                header: DOM.$('imgui-header'),
                close: DOM.$('imgui-close'),
                prompt: DOM.$('imgui-prompt'),
                grid: DOM.$('imgui-grid'),
                logic: DOM.$('imgui-logic'),
                step: DOM.$('imgui-step')
            };
        }

        show() { this.root.style.display = 'block'; }
        hide() { this.root.style.display = 'none'; }
        setPrompt(t) { this.els.prompt.textContent = `PROMPT: ${t}`; }
        setStep(c, t) { this.els.step.textContent = `STEP: ${c} OF ${t}`; }
        setLogic(type, target, suffix = '') {
            this.els.logic.textContent = `LOGIC: ${type}${target != null ? '_' + target : ''}${suffix}`;
        }
        clearGrid() { this.els.grid.innerHTML = ''; }
        addCard(card) { this.els.grid.appendChild(card); }
    }

    // ═══════════════════════════════════════════════════════════════
    // CARD BUILDER
    // ═══════════════════════════════════════════════════════════════

    class CardBuilder {
        static create(idx, b64, onClick) {
            const img = new Image();
            img.src = `data:image/png;base64,${b64}`;

            const stats = DOM.create('span', { className: 'stats', text: '...' });
            const card = DOM.create('div', { className: 'imgui-card', onClick }, [
                img,
                DOM.create('div', { className: 'imgui-footer' }, [
                    DOM.create('span', { text: `#${idx}` }),
                    stats
                ])
            ]);

            return { card, img, stats };
        }

        static setStats(el, empty, total) {
            el.textContent = `E:${empty} T:${total}`;
        }

        static markPredicted(card) {
            card.classList.add('predicted');
            card.appendChild(DOM.create('div', { className: 'imgui-badge', text: 'PREDICTION' }));
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // MAIN CONTROLLER
    // ═══════════════════════════════════════════════════════════════

    class CaptchaDebugger {
        constructor() {
            this.panel = new Panel();
        }

        start() {
            if (!this.#ready()) {
                setTimeout(() => this.start(), CONFIG.TIMING.HOOK_RETRY);
                return;
            }
            console.log('[TCaptcha Debugger] Hooks armed.');
            this.panel.init();
            this.#hook();
            this.#checkExisting();
        }

        #ready() {
            return TARGET_WINDOW.TCaptcha?.setTaskId && BoxDetector.isReady;
        }

        #hook() {
            const tc = TARGET_WINDOW.TCaptcha;

            ['setTaskId', 'setChallenge', 'setTaskItem', 'toggleSlider'].forEach(m => {
                const orig = tc[m];
                if (!orig) return;
                tc[m] = (...args) => {
                    const res = orig.apply(tc, args);
                    setTimeout(() => this.#refresh(), CONFIG.TIMING.UPDATE_DELAY);
                    return res;
                };
            });

            const origClear = tc.clearChallenge;
            tc.clearChallenge = (...args) => {
                origClear?.apply(tc, args);
                this.panel.hide();
            };
        }

        #checkExisting() {
            if (TARGET_WINDOW.TCaptcha.tasks?.length) this.#refresh();
        }

        async #refresh() {
            const tc = TARGET_WINDOW.TCaptcha;
            const task = tc?.getCurrentTask?.();

            if (!task) {
                this.panel.hide();
                return;
            }

            this.panel.show();
            const logic = InstructionParser.parse(task.str || '');
            this.panel.setPrompt(logic.cleanText);
            this.panel.setStep((tc.taskId || 0) + 1, tc.tasks.length);
            this.panel.setLogic(logic.type, logic.type === LogicType.EXACT ? logic.target : null);

            const results = await this.#analyze(tc, task.items);
            this.#highlight(results, logic);
        }

        async #analyze(tc, items) {
            this.panel.clearGrid();
            const results = [];

            const jobs = items.map((b64, idx) => new Promise(resolve => {
                const { card, img, stats } = CardBuilder.create(idx, b64, () => this.#select(tc, idx));
                this.panel.addCard(card);

                img.onload = () => {
                    const { empty, total } = BoxDetector.analyze(img);
                    results.push({ idx, empty, total, card });
                    CardBuilder.setStats(stats, empty, total);
                    resolve();
                };

                img.onerror = () => {
                    results.push({ idx, empty: 0, total: 0, card });
                    CardBuilder.setStats(stats, '?', '?');
                    resolve();
                };
            }));  

            await Promise.all(jobs);
            return results;
        }

        #select(tc, idx) {
            if (!tc.sliderNode) return;
            tc.sliderNode.value = idx + 1;
            tc.sliderNode.dispatchEvent(new Event('input', { bubbles: true }));
            tc.onNextClick();
        }

        #highlight(results, logic) {
            const { index, approximate } = Predictor.calculate(results, logic);
            if (index === -1) return;

            const match = results.find(r => r.idx === index);
            if (match) {
                CardBuilder.markPredicted(match.card);
                if (approximate) {
                    this.panel.setLogic(logic.type, logic.target, ' (APPROX)');
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // ENTRY POINT
    // ═══════════════════════════════════════════════════════════════

    new CaptchaDebugger().start();

})();

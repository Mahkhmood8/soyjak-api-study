//page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { Clock, Upload } from 'lucide-react';

interface QueueItem {
  id: number;
  image: string;
  submittedBy: string;
  timestamp: string;
  status: string;
  captcha?: { x: number; y: number; captcha_text: string };
}

interface CaptchaCoordinates {
  x: number;
  y: number;
}

export default function ImageQueueViewer() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [view, setView] = useState<'viewer' | 'submit'>('viewer');
  const [loading, setLoading] = useState(false);
  const [captchaCoords, setCaptchaCoords] = useState<CaptchaCoordinates | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const fetchQueue = async () => {
    try {
      const res = await fetch('/api/queue');
      const data = await res.json();
      if (data.success) setQueue(data.queue);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = setInterval(fetchQueue, 3000);
    return () => clearInterval(interval);
  }, []);

  const currentItem = queue[0];

  useEffect(() => {
    if (currentItem) setCaptchaCoords(null);
  }, [currentItem?.id]);

  const submitImage = async (base64Image: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Image, submittedBy: 'James' }),
      });
      const data = await res.json();
      if (data.success) await fetchQueue();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => submitImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleAction = async (action: string) => {
    if (!currentItem || !captchaCoords) {
      alert('Click on the image to provide captcha coordinates first.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/queue/${currentItem.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          captcha: { 
            x: Math.round(captchaCoords.x), 
            y: Math.round(captchaCoords.y),
            captcha_text: action
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        console.log('Processed item:', data.processedItem); // includes captcha with captcha_text
        await fetchQueue();
        setCaptchaCoords(null);
      } else {
        console.error('Error processing task', data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleImageClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!imgRef.current) return;
    const rect = imgRef.current.getBoundingClientRect();
    const scaleX = imgRef.current.naturalWidth / rect.width;
    const scaleY = imgRef.current.naturalHeight / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    setCaptchaCoords({ x, y });
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const diffMins = Math.floor((Date.now() - date.getTime()) / 60000);
    if (diffMins < 60) return `${diffMins} minutes ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hours ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 text-white p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Image Review Queue</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setView('viewer')}
              className={`px-4 py-2 rounded-lg transition ${view === 'viewer' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}
            >
              Viewer
            </button>
            <button
              onClick={() => setView('submit')}
              className={`px-4 py-2 rounded-lg transition ${view === 'submit' ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}
            >
              Submit (James)
            </button>
          </div>
        </div>

        {view === 'submit' ? (
          <div className="bg-slate-800 rounded-2xl p-8 border border-slate-700">
            <h2 className="text-2xl font-semibold mb-6">Submit Image to Queue</h2>
            <div className="border-2 border-dashed border-slate-600 rounded-xl p-12 text-center hover:border-blue-500 transition">
              <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" id="file-upload" disabled={loading} />
              <label htmlFor="file-upload" className={`cursor-pointer ${loading ? 'opacity-50' : ''}`}>
                <Upload className="mx-auto mb-4 text-slate-400" size={64} />
                <p className="text-xl mb-2">{loading ? 'Uploading...' : 'Click to upload image'}</p>
                <p className="text-slate-400">or drag and drop</p>
              </label>
            </div>
            <div className="mt-6 text-slate-400">Total items in queue: {queue.length}</div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pending Items */}
            <div className="bg-slate-800 rounded-xl p-4 border border-slate-700 flex items-center gap-4">
              <Clock className="text-blue-400" size={24} />
              <div>
                <p className="text-sm text-slate-400">Pending Items</p>
                <p className="text-2xl font-bold">{queue.length}</p>
              </div>
            </div>

            {queue.length === 0 ? (
              <div className="bg-slate-800 rounded-2xl p-16 text-center border border-slate-700">
                <div className="text-6xl mb-4">✨</div>
                <h2 className="text-2xl font-semibold mb-2">Queue is Empty</h2>
                <p className="text-slate-400">No pending images to review</p>
              </div>
            ) : (
              <div className="bg-slate-800 rounded-2xl p-6 border border-slate-700">
                <div className="mb-4 flex justify-between items-center">
                  <div>
                    <p className="text-sm text-slate-400">Submitted by</p>
                    <p className="font-semibold">{currentItem.submittedBy}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-400">Submitted</p>
                    <p className="font-semibold">{formatTimestamp(currentItem.timestamp)}</p>
                  </div>
                </div>

                {/* Image */}
                <div className="mb-4 relative">
                  <img
                    ref={imgRef}
                    src={currentItem.image}
                    alt="Review item"
                    onClick={handleImageClick}
                    className="w-full max-w-2xl h-auto rounded-xl cursor-crosshair"
                  />
                  {captchaCoords && imgRef.current && (
                    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none">
                      <line
                        x1={(captchaCoords.x * imgRef.current.width) / imgRef.current.naturalWidth}
                        y1="0"
                        x2={(captchaCoords.x * imgRef.current.width) / imgRef.current.naturalWidth}
                        y2="100%"
                        stroke="#3b82f6"
                        strokeWidth="3"
                        style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))' }}
                      />
                      <line
                        x1="0"
                        y1={(captchaCoords.y * imgRef.current.height) / imgRef.current.naturalHeight}
                        x2="100%"
                        y2={(captchaCoords.y * imgRef.current.height) / imgRef.current.naturalHeight}
                        stroke="#3b82f6"
                        strokeWidth="3"
                        style={{ filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))' }}
                      />
                      <circle
                        cx={(captchaCoords.x * imgRef.current.width) / imgRef.current.naturalWidth}
                        cy={(captchaCoords.y * imgRef.current.height) / imgRef.current.naturalHeight}
                        r="6"
                        fill="#3b82f6"
                      />
                      <circle
                        cx={(captchaCoords.x * imgRef.current.width) / imgRef.current.naturalWidth}
                        cy={(captchaCoords.y * imgRef.current.height) / imgRef.current.naturalHeight}
                        r="3"
                        fill="white"
                      />
                    </svg>
                  )}
                  {captchaCoords && (
                    <div className="mt-2 text-sm text-slate-400">
                      Captcha coordinates: X={Math.round(captchaCoords.x)}, Y={Math.round(captchaCoords.y)}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-4 gap-3">
                  {['ferajak','soyjak','gapejak','cobson','babyjak','amerimutt','Flartson','a24'].map((action) => (
                    <button
                      key={action}
                      onClick={() => handleAction(action)}
                      disabled={loading}
                      className="bg-slate-700 hover:bg-slate-600 text-white py-4 px-4 rounded-lg font-semibold transition transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {action.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
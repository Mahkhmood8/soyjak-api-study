// app/api/queue/route.ts
import { NextResponse } from 'next/server';

interface QueueItem {
  id: number;
  image: string;
  submittedBy: string;
  timestamp: string;
  status: 'pending' | 'completed';
  captcha?: { x: number; y: number; captcha_text: string };
}

// Use global namespace for shared state
declare global {
  var queueStore: {
    queue: QueueItem[];
    completedQueue: QueueItem[];
  };
}

if (!global.queueStore) {
  global.queueStore = {
    queue: [],
    completedQueue: [],
  };
}

// Auto-cleanup completed tasks older than 10 minutes
const CLEANUP_INTERVAL = 60_000; // run every minute
const MAX_AGE = 10 * 60 * 1000; // 10 minutes

setInterval(() => {
  const now = Date.now();
  global.queueStore.completedQueue = global.queueStore.completedQueue.filter(
    (item) => now - new Date(item.timestamp).getTime() < MAX_AGE
  );
}, CLEANUP_INTERVAL);

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskIdParam = searchParams.get('task_id');
  const { queue, completedQueue } = global.queueStore;

  if (taskIdParam) {
    const taskId = Number(taskIdParam);
    if (isNaN(taskId))
      return NextResponse.json(
        { success: false, error: 'Invalid task_id' },
        { status: 400 }
      );

    const activeItem = queue.find((i) => i.id === taskId);
    const completedItem = completedQueue.find((i) => i.id === taskId);

    // ✅ If still pending
    if (activeItem) {
      return NextResponse.json({
        success: true,
        status: 'pending',
        task_id: taskId,
        item: activeItem,
      });
    }

    // ✅ If already completed
    if (completedItem) {
      return NextResponse.json({
        success: true,
        status: 'completed',
        task_id: taskId,
        captcha: completedItem.captcha || null,
      });
    }

    // ✅ If task missing (already cleaned up) → synthesize a completed response
    return NextResponse.json({
      success: true,
      status: 'completed',
      task_id: taskId,
      captcha: null,
      message: 'Task assumed completed (not found in memory)',
    });
  }

  // Default: return all pending items
  return NextResponse.json({
    success: true,
    queue,
    count: queue.length,
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { image, submittedBy } = body;
    const { queue } = global.queueStore;

    // 🧩 Submitting a new image
    if (image && submittedBy) {
      const newItem: QueueItem = {
        id: Date.now(),
        image,
        submittedBy,
        timestamp: new Date().toISOString(),
        status: 'pending',
      };
      queue.push(newItem);

      return NextResponse.json({
        success: true,
        status: 'pending',
        task_id: newItem.id,
        item: newItem,
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid payload' },
      { status: 400 }
    );
  } catch (err) {
    console.error('POST /api/queue error', err);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
// app/api/queue/[id]/route.ts
import { NextResponse } from 'next/server';

interface QueueItem {
  id: number;
  image: string;
  submittedBy: string;
  timestamp: string;
  status: 'pending' | 'completed';
  captcha?: { x: number; y: number; captcha_text: string };
}

// Temporary solution: use global namespace
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

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const taskId = Number(id);
    
    if (isNaN(taskId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid task ID' },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { action, captcha } = body;

    if (!action || !captcha || typeof captcha.x !== 'number' || typeof captcha.y !== 'number' || typeof captcha.captcha_text !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid action or captcha coordinates' },
        { status: 400 }
      );
    }

    const { queue, completedQueue } = global.queueStore;
    const index = queue.findIndex((i) => i.id === taskId);

    if (index === -1) {
      return NextResponse.json(
        { success: false, error: 'Task not found' },
        { status: 404 }
      );
    }

    const completedItem: QueueItem = {
      ...queue[index],
      status: 'completed',
      captcha,
    };

    queue.splice(index, 1);
    completedQueue.push(completedItem);

    return NextResponse.json({
      success: true,
      status: 'completed',
      task_id: taskId,
      captcha,
      processedItem: completedItem,
    });
  } catch (err) {
    console.error('POST /api/queue/[id] error', err);
    return NextResponse.json(
      { success: false, error: 'Server error' },
      { status: 500 }
    );
  }
}
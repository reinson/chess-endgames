// Type definitions for Stockfish Web Worker
interface StockfishWorker {
  postMessage(message: string): void;
  onmessage: ((event: { data: string }) => void) | null;
  onerror: ((error: ErrorEvent) => void) | null;
  terminate(): void;
}

interface EvaluationResult {
  score: number | null;
  mate: number | null;
  depth: number;
  nodes: number;
  time: number;
}

let stockfishInstance: StockfishWorker | null = null;
let isEngineReady = false;
let currentEvaluationResolve: ((result: EvaluationResult) => void) | null = null;
let currentEvaluationReject: ((error: Error) => void) | null = null;
let lastEvaluation: EvaluationResult | null = null;

function initializeStockfish(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isEngineReady && stockfishInstance) {
      resolve();
      return;
    }

    try {
      // Clean up existing instance if any
      if (stockfishInstance) {
        stockfishInstance.postMessage('quit');
        stockfishInstance.terminate();
        stockfishInstance = null;
        isEngineReady = false;
      }

      // Create a new worker
      const workerPath = `${import.meta.env.BASE_URL}stockfish/stockfish.js`;
      const worker = new Worker(workerPath, { type: 'module' });
      stockfishInstance = worker as unknown as StockfishWorker;
      
      stockfishInstance.onmessage = (event: { data: string }) => {
        const message = event.data;
        console.log('Stockfish message:', message);
        
        // Handle initial engine ready messages
        if (message === 'readyok' || message.includes('Stockfish')) {
          isEngineReady = true;
          resolve();
          return;
        }

        // Handle evaluation messages
        if (currentEvaluationResolve) {
          if (message.startsWith('bestmove')) {
            // If we get a bestmove and have a last evaluation, use it
            if (lastEvaluation && currentEvaluationResolve) {
              currentEvaluationResolve(lastEvaluation);
              currentEvaluationResolve = null;
              currentEvaluationReject = null;
              lastEvaluation = null;
            }
            return;
          }

          if (message.includes('score cp')) {
            const scoreMatch = message.match(/score cp (-?\d+)/);
            const depthMatch = message.match(/depth (\d+)/);
            const nodesMatch = message.match(/nodes (\d+)/);
            const timeMatch = message.match(/time (\d+)/);

            if (scoreMatch && depthMatch) {
              const result: EvaluationResult = {
                score: parseInt(scoreMatch[1]) / 100,
                mate: null,
                depth: parseInt(depthMatch[1]),
                nodes: nodesMatch ? parseInt(nodesMatch[1]) : 0,
                time: timeMatch ? parseInt(timeMatch[1]) : 0
              };
              
              // Store this evaluation
              lastEvaluation = result;
              
              // Resolve immediately for quick evaluations
              if (currentEvaluationResolve) {
                currentEvaluationResolve(result);
                currentEvaluationResolve = null;
                currentEvaluationReject = null;
                lastEvaluation = null;
              }
            }
          } else if (message.includes('score mate')) {
            const mateMatch = message.match(/score mate (-?\d+)/);
            const depthMatch = message.match(/depth (\d+)/);
            const nodesMatch = message.match(/nodes (\d+)/);
            const timeMatch = message.match(/time (\d+)/);

            if (mateMatch && depthMatch) {
              const result: EvaluationResult = {
                score: null,
                mate: parseInt(mateMatch[1]),
                depth: parseInt(depthMatch[1]),
                nodes: nodesMatch ? parseInt(nodesMatch[1]) : 0,
                time: timeMatch ? parseInt(timeMatch[1]) : 0
              };
              
              // Store this evaluation
              lastEvaluation = result;
              
              // Resolve immediately for quick evaluations
              if (currentEvaluationResolve) {
                currentEvaluationResolve(result);
                currentEvaluationResolve = null;
                currentEvaluationReject = null;
                lastEvaluation = null;
              }
            }
          }
        }
      };

      stockfishInstance.onerror = (error: ErrorEvent) => {
        console.error('Stockfish worker error:', error);
        const errorObj = new Error(error.message || 'Stockfish worker error');
        if (currentEvaluationReject) {
          currentEvaluationReject(errorObj);
          currentEvaluationResolve = null;
          currentEvaluationReject = null;
        }
        reject(errorObj);
      };

      // Initialize the engine with optimized settings for quick evaluations
      const commands = [
        'uci',
        'setoption name Hash value 128',
        'setoption name Threads value 4',
        'setoption name MultiPV value 1',
        'setoption name Move Overhead value 0',
        'setoption name Minimum Thinking Time value 0',
        'setoption name Slow Mover value 0',
        'isready'
      ];

      commands.forEach(cmd => {
        if (stockfishInstance) {
          stockfishInstance.postMessage(cmd);
        }
      });

    } catch (error) {
      reject(error);
    }
  });
}

export async function evaluatePosition(fen: string, movetime: number = 2000): Promise<EvaluationResult> {
  await initializeStockfish();

  if (!stockfishInstance || !isEngineReady) {
    throw new Error('Stockfish engine is not ready');
  }

  return new Promise((resolve, reject) => {
    let timeoutId: number;
    
    const cleanup = () => {
      clearTimeout(timeoutId);
      currentEvaluationResolve = null;
      currentEvaluationReject = null;
      lastEvaluation = null;
    };

    currentEvaluationResolve = (result) => {
      cleanup();
      resolve(result);
    };

    currentEvaluationReject = (error) => {
      cleanup();
      reject(error);
    };

    lastEvaluation = null;
    
    // Stop any ongoing evaluation
    stockfishInstance!.postMessage('stop');
    // Set up the new position
    stockfishInstance!.postMessage('position fen ' + fen);
    // Use the specified movetime
    stockfishInstance!.postMessage(`go movetime ${movetime}`);

    // Set a timeout slightly longer than the movetime
    timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('Evaluation timed out'));
    }, movetime + 100);
  });
}

// Clean up function to be called when the app is unmounted
export function cleanupStockfish() {
  if (stockfishInstance) {
    // Reject any pending evaluation
    if (currentEvaluationReject) {
      currentEvaluationReject(new Error('Stockfish instance is being cleaned up'));
    }
    stockfishInstance.postMessage('quit');
    stockfishInstance.terminate();
    stockfishInstance = null;
    isEngineReady = false;
    currentEvaluationResolve = null;
    currentEvaluationReject = null;
    lastEvaluation = null;
  }
} 
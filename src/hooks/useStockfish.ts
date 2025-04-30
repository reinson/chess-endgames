import { useState, useEffect, useRef, useCallback } from 'react';

export interface EvaluationResult {
  score?: number; // Centipawns
  mate?: number;  // Mate in X moves
  depth?: number;
  bestMove?: string; // Add best move field
}

// Helper (can be moved out if needed)
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export function useStockfish() {
  const [isReady, setIsReady] = useState<boolean>(false);
  const workerRef = useRef<Worker | null>(null);
  const isEngineBusy = useRef<boolean>(false); // Internal busy flag
  const currentEvalRef = useRef<EvaluationResult | null>(null); // Store latest info during search
  const currentEvalPromiseResolve = useRef<((value: EvaluationResult | null) => void) | null>(null);
  const currentEvalPromiseReject = useRef<((reason?: any) => void) | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);


  // Function to send raw commands (keep internal)
  const sendCommand = useCallback((command: string) => {
    if (workerRef.current && isReady) {
       // console.log("[Internal] Sending command:", command);
       workerRef.current.postMessage(command);
    } else if (workerRef.current && !isReady && (command === 'uci' || command === 'isready')) { // Allow uci and isready during init
        // console.log(`[Internal] Sending init command (${command})...`);
        workerRef.current.postMessage(command);
    } else {
       console.error(`useStockfish internal: Worker not ready(ready=${isReady})/initialized. Cannot send command:`, command);
    }
  }, [isReady]); // isReady dependency is important here

  // Initialize worker
  useEffect(() => {
    // console.log("Initializing worker...");
    // console.log("BASE_URL for worker:", import.meta.env.BASE_URL);
    const workerPath = `${import.meta.env.BASE_URL}stockfish/stockfish-nnue-16-single.js`;
    // console.log("Constructed worker path:", workerPath);
    const worker = new Worker(workerPath, { type: 'module' }); // Ensure type: module if needed
    workerRef.current = worker;
    isEngineBusy.current = false;
    currentEvalRef.current = null;
    currentEvalPromiseResolve.current = null;
    currentEvalPromiseReject.current = null;
    if(timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsReady(false); // Explicitly set not ready on init/re-init

    worker.onmessage = (event) => {
      const message = event.data;

      if (typeof message === 'string') {
        // console.log("[Worker msg]:", message); // Optional debug log

        // Parse info lines
        if (message.startsWith('info')) {
          const depthMatch = message.match(/depth (\d+)/);
          const currentDepth = depthMatch ? parseInt(depthMatch[1]) : undefined;
          if (message.includes('score cp')) {
            const scoreMatch = message.match(/score cp (-?\d+)/);
            if (scoreMatch) currentEvalRef.current = { ...currentEvalRef.current, score: parseInt(scoreMatch[1]), mate: undefined, depth: currentDepth };
          } else if (message.includes('score mate')) {
            const mateMatch = message.match(/score mate (-?\d+)/);
            if (mateMatch) currentEvalRef.current = { ...currentEvalRef.current, mate: parseInt(mateMatch[1]), score: undefined, depth: currentDepth };
          }
        }
        // Handle completion
        else if (message.startsWith('bestmove')) {
          if(timeoutRef.current) clearTimeout(timeoutRef.current);
          const parts = message.split(' ');
          const bestMove = parts[1] && parts[1] !== '(none)' ? parts[1] : undefined;
          if (currentEvalRef.current) {
             currentEvalRef.current.bestMove = bestMove;
          } else {
             currentEvalRef.current = { bestMove: bestMove };
          }

          if (currentEvalPromiseResolve.current) {
             // console.log("useStockfish: Bestmove received, resolving promise with:", currentEvalRef.current);
             currentEvalPromiseResolve.current(currentEvalRef.current);
          } else {
              console.warn("useStockfish: Received bestmove but no promise was pending.");
          }
           // Clean up for next evaluation
           isEngineBusy.current = false;
           currentEvalPromiseResolve.current = null;
           currentEvalPromiseReject.current = null;
           currentEvalRef.current = null;
        }
        // Handle UCI confirmation
        else if (message === 'uciok') {
          // console.log("useStockfish: UCI OK received. Sending isready.");
           sendCommand('isready'); // Send isready after uciok
         }
         else if (message === 'readyok') {
          // console.log("useStockfish: Engine readyok received.");
           if (!isReady) {
                // console.log("Setting engine to ready state.");
                setIsReady(true); // Set ready *only* after readyok
           }
           isEngineBusy.current = false; // Ensure not busy if we were waiting for readyok
         }

      } else if (typeof message === 'object' && message !== null) {
         console.warn("useStockfish: Received unexpected object message:", message);
      }
    };

     worker.onerror = (error) => {
       console.error("useStockfish: Worker error event:", error);
       if (currentEvalPromiseReject.current) {
           currentEvalPromiseReject.current(error);
       }
       if(timeoutRef.current) clearTimeout(timeoutRef.current);
       setIsReady(false);
       isEngineBusy.current = false;
       currentEvalPromiseResolve.current = null;
       currentEvalPromiseReject.current = null;
     };

     // Initial UCI command to kick things off
     sendCommand('uci'); // Send UCI right away

     return () => {
       // console.log("useStockfish: Terminating worker.");
       worker.terminate();
       if(timeoutRef.current) clearTimeout(timeoutRef.current);
       workerRef.current = null;
       setIsReady(false);
       isEngineBusy.current = false;
     };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Keep deps empty for single worker instance lifecycle


  // The new function to evaluate a position
  const evaluateFen = useCallback(async (fen: string, moveTime: number): Promise<EvaluationResult | null> => {
      if (!isReady) {
          // Wait briefly for readiness if not ready yet
          // console.log("Evaluate called but engine not ready, waiting briefly...");
          let waitLoops = 0;
          while(!isReady) {
              if(waitLoops++ > 50) throw new Error("Engine did not become ready in time."); // ~5s timeout
              await wait(100);
          }
          // console.log("Engine now ready, proceeding with evaluation.");
      }
      if (isEngineBusy.current) {
          // console.warn("Engine is busy, evaluation request queued/delayed (simple wait)");
          let waitLoops = 0;
           while (isEngineBusy.current) {
               if(waitLoops++ > 200) throw new Error("Timeout waiting for engine to become free.");
               await wait(100);
           }
           // console.log("Engine became free, proceeding with evaluation.");
      }

      return new Promise<EvaluationResult | null>((resolve, reject) => {
          // console.log(`Starting evaluation promise for FEN: ${fen} (movetime ${moveTime})`);
          isEngineBusy.current = true;
          currentEvalRef.current = null;
          currentEvalPromiseResolve.current = resolve;
          currentEvalPromiseReject.current = reject;

          const timeoutDuration = moveTime + 5000;
          if(timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
              console.error(`Evaluation timeout (${timeoutDuration}ms) for FEN: ${fen}`);
              if (currentEvalPromiseReject.current) {
                 currentEvalPromiseReject.current(new Error(`Evaluation timed out after ${timeoutDuration}ms`));
              }
               isEngineBusy.current = false;
               currentEvalPromiseResolve.current = null;
               currentEvalPromiseReject.current = null;
               currentEvalRef.current = null;
               sendCommand('stop'); // Try to stop the engine
          }, timeoutDuration);

          // Send commands
          sendCommand(`position fen ${fen}`);
          // No artificial wait needed here, engine should process sequentially
          sendCommand(`go movetime ${moveTime}`);
      });

  }, [isReady, sendCommand]); // Depends on isReady state and sendCommand identity


  // Only expose readiness state and the evaluation function
  return { isReady, evaluateFen };
}
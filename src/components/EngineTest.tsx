import React, { useState } from 'react';
import { useStockfish, EvaluationResult } from '../hooks/useStockfish';

export function EngineTest() {
  const [fenInput, setFenInput] = useState<string>('');
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { isReady: engineReady, evaluateFen } = useStockfish();

  const handleEvaluate = async () => {
    setError(null);
    setResult(null);
    if (!evaluateFen) {
      setError('Engine evaluation function is not available.');
      return;
    }
    try {
      const res = await evaluateFen(fenInput, 1000);
      setResult(res);
    } catch (e: any) {
      console.error('Evaluation error', e);
      setError(e.message || 'Unknown error');
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto', textAlign: 'left', color: '#333' }}>
      <h1>Stockfish Engine Test</h1>
      <div style={{ marginBottom: '10px' }}>
        <label htmlFor="fen-input" style={{ display: 'block', marginBottom: '4px' }}>FEN:</label>
        <input
          id="fen-input"
          type="text"
          value={fenInput}
          onChange={e => setFenInput(e.target.value)}
          placeholder="Enter FEN string"
          style={{ width: '100%', padding: '8px', fontSize: '14px', boxSizing: 'border-box' }}
        />
      </div>
      <button
        onClick={handleEvaluate}
        disabled={!engineReady || !fenInput.trim()}
        style={{ padding: '10px 20px', fontSize: '16px', fontWeight: 500, cursor: engineReady ? 'pointer' : 'not-allowed' }}
      >
        {engineReady ? 'Evaluate' : 'Loading Engine...'}
      </button>

      {error && (
        <div style={{ marginTop: '10px', color: 'red' }}>Error: {error}</div>
      )}

      {result && (
        <div style={{ marginTop: '10px' }}>
          <h3>Result:</h3>
          <pre style={{ background: '#f1f3f5', padding: '10px', borderRadius: '4px' }}>
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
} 
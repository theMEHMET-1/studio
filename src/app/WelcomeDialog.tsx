'use client';

import { useState, useEffect } from 'react';

export function WelcomeDialog() {
  const [open, setOpen] = useState(false);
 
  useEffect(() => {
    setOpen(true);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full">
        <h2 className="text-lg font-bold mb-4">Welcome!</h2>
        <p>This dialog shows up automatically.</p>
        <button
          className="mt-4 px-4 py-2 bg-blue-500 text-white rounded"
          onClick={() => setOpen(false)}
        >
          Close
        </button>
      </div>
    </div>
  );
}





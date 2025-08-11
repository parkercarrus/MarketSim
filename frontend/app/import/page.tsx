'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';


export default function ImportPage() {
    const [token, setToken] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api";

    const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
        const tok = token.trim();

        if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(tok)) {
        setError('Invalid token format');
        return;
        }

        const res = await fetch(`${API_URL}/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: tok }),
        });

        if (!res.ok) {
        let msg = 'Invalid token';
        try {
            const j = await res.json();
            msg = j?.detail ?? j?.message ?? msg;
        } catch {}
        setError(msg);
        return;
        }

        router.push('/dashboard');
    } catch {
        setError('Import failed. Check your network and token.');
    } finally {
        setLoading(false);
    }
    };


    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-white">
            <div className="w-full max-w-2xl p-12 rounded-2xl shadow-2xl bg-white">
                <button
                    className="mb-6 text-blue-400 hover:underline"
                    onClick={() => router.push('/initialize')}
                    type="button"
                >
                    &larr; Back
                </button>
                <h1 className="text-2xl font-bold mb-6 text-gray-900">Import Simulation Parameters</h1>
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                    <textarea
                        className="w-full h-40 p-4 border border-gray-300 rounded-lg text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none bg-gray-50"
                        placeholder="Paste your token here..."
                        value={token}
                        onChange={e => setToken(e.target.value)}
                        required
                        disabled={loading}
                    />
                    {error && (
                        <div className="text-red-600 text-center font-medium">{error}</div>
                    )}
                    <button
                        type="submit"
                        className="w-full py-3 bg-blue-400 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                        disabled={loading}
                    >
                        {loading ? 'Importing...' : 'Import'}
                    </button>
                </form>
            </div>
        </div>
    );
}
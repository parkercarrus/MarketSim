import React from 'react';
import Link from 'next/link';

const AboutPage: React.FC = () => {
    return (
        <main className="min-h-screen bg-white text-black dark:bg-zinc-900 dark:text-white px-6 py-8 font-mono">
            <div
                className={`border rounded-lg p-4 flex justify-between items-end mb-6 bg-white dark:bg-zinc-900 ${
                    "border-black"
                }`}
            >
                <h1 className="text-3xl font-bold tracking-tight">API Docs</h1>
                <div>
                    <Link href="/" className="text-black-600 hover:underline dark:text-white mr-4">
                        Home
                    </Link>
                    <Link href="/about" className="text-black-600 hover:underline dark:text-white mr-4">
                        About
                    </Link>
                    <Link href="/dashboard" className="text-black-600 hover:underline dark:text-white">
                        Simulation
                    </Link>
                </div>
            </div>

            <div className="flex justify-center items-center w-full min-h-screen pt-24 pb-12">
                <div className="text-2xl font-semibold text-center">
                    Coming soon.
                </div>
            </div>
        </main>
    );
};

export default AboutPage;

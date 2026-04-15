import React from 'react';
import TopNavBar from './TopNavBar';
import Sidebar from './Sidebar';

const BaseLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    return (
        <div className="flex h-screen w-full bg-transparent overflow-hidden font-sans text-[var(--color-text-primary)]">
            <Sidebar />
            <div className="flex-1 flex flex-col min-w-0 bg-transparent">
                <TopNavBar />
                <main className="flex-1 overflow-auto p-4 md:p-6 relative">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default BaseLayout;

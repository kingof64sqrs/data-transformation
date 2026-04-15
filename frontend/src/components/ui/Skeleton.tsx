import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { type ClassValue } from 'clsx';

interface SkeletonProps {
    className?: string;
}

export const Skeleton = ({ className }: SkeletonProps) => {
    return (
        <div
            className={cn(
                "animate-pulse bg-[var(--color-surface-1)] rounded overflow-hidden relative",
                className
            )}
        >
            <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent animate-scanning-line" />
        </div>
    );
};

"use client";

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Trash2 } from 'lucide-react';
import { useSystemStore, type WindowPayload } from '@/store/useSystemStore';
import { SAMPLE_PICTURES_PATH, isFile, listDir, lookup, type VFile } from '@/system/vfs';
import { prettyPath } from '@/system/shell';
import { useFsRevision } from '@/utils/fs';
import { xpConfirm } from '@/utils/dialog';

/**
 * Windows Picture and Fax Viewer, over the filesystem.
 *
 * It used to cycle through a hardcoded list of four images. It now shows the pictures in a folder
 * of the virtual filesystem — Sample Pictures by default, or whatever folder the opened picture is
 * in — so a picture saved to My Pictures (from Paint, or anywhere else) is simply there, and
 * Previous/Next walk the same files Explorer lists. Visitor pictures can be deleted; the built-in
 * ones cannot, and the button says why.
 */

interface ImageViewerAppProps {
    windowId?: string;
    /** `{ path }` of the picture to show. */
    payload?: WindowPayload;
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/')) || '/';

export default function ImageViewerApp({ windowId, payload }: ImageViewerAppProps) {
    const actions = useSystemStore((s) => s.actions);
    const revision = useFsRevision();

    const [current, setCurrent] = useState<string>(() => {
        if (payload?.path) return payload.path;
        const first = (listDir(SAMPLE_PICTURES_PATH) ?? []).find((n) => isFile(n) && n.src);
        return first ? `${SAMPLE_PICTURES_PATH}/${first.name}` : SAMPLE_PICTURES_PATH;
    });
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);

    // A later `open` on this window shows the new picture.
    useEffect(() => {
        if (payload?.path) {
            setCurrent(payload.path);
            setZoom(1);
            setRotation(0);
        }
    }, [payload]);

    const folder = dirOf(current);
    const pictures = useMemo(
        () => (listDir(folder) ?? []).filter((n): n is VFile => isFile(n) && Boolean(n.src)),
        // `revision` changes whenever a visitor file is written or deleted.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [folder, revision],
    );
    const node = lookup(current);
    const img = node && isFile(node) && node.src ? node : undefined;
    const index = img ? pictures.findIndex((p) => p.name === img.name) : -1;

    useEffect(() => {
        if (!windowId) return;
        actions.setWindowTitle(windowId, img ? `${img.name} - Windows Picture and Fax Viewer` : 'Windows Picture and Fax Viewer');
    }, [windowId, img, actions]);

    const show = (i: number) => {
        if (!pictures.length) return;
        const next = pictures[(i + pictures.length) % pictures.length];
        setCurrent(`${folder}/${next.name}`);
        setZoom(1);
        setRotation(0);
    };

    const remove = async () => {
        if (!img?.writable) return;
        const ok = await xpConfirm('Confirm File Delete', `Are you sure you want to delete '${img.name}'?`, {
            confirmLabel: 'Yes',
            cancelLabel: 'No',
            icon: 'warning',
        });
        if (!ok) return;
        const remaining = pictures.filter((p) => p.name !== img.name);
        actions.deleteUserFile(current);
        const next = remaining[Math.min(Math.max(index, 0), remaining.length - 1)];
        setCurrent(next ? `${folder}/${next.name}` : folder);
    };

    return (
        <div className="flex h-full select-none flex-col bg-[#ece9d8] font-sans">
            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-gray-700">
                {img ? (
                    // eslint-disable-next-line @next/next/no-img-element -- data: URLs and .ico/.png assets; nothing to optimise
                    <img
                        src={img.src}
                        alt={img.name}
                        className="max-h-full max-w-full object-contain transition-transform"
                        style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
                        draggable={false}
                    />
                ) : (
                    <p className="px-6 text-center text-xs text-gray-200">
                        There are no pictures in {prettyPath(folder)}.
                    </p>
                )}
                {img && (
                    <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                        {img.name} — {index + 1} / {pictures.length}
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-center gap-2 border-t border-gray-400 bg-[#ece9d8] p-2">
                <ToolButton onClick={() => show(index - 1)} title="Previous Image" disabled={pictures.length < 2}>
                    <ChevronLeft size={18} />
                </ToolButton>
                <ToolButton onClick={() => show(index + 1)} title="Next Image" disabled={pictures.length < 2}>
                    <ChevronRight size={18} />
                </ToolButton>
                <div className="mx-1 h-6 w-px bg-gray-400" />
                <ToolButton onClick={() => setZoom(z => Math.min(z + 0.25, 3))} title="Zoom In" disabled={!img}>
                    <ZoomIn size={18} />
                </ToolButton>
                <ToolButton onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} title="Zoom Out" disabled={!img}>
                    <ZoomOut size={18} />
                </ToolButton>
                <ToolButton onClick={() => { setZoom(1); setRotation(0); }} title="Actual Size" disabled={!img}>
                    1:1
                </ToolButton>
                <div className="mx-1 h-6 w-px bg-gray-400" />
                <ToolButton onClick={() => setRotation(r => r + 90)} title="Rotate Clockwise" disabled={!img}>
                    <RotateCw size={18} />
                </ToolButton>
                <ToolButton
                    onClick={() => void remove()}
                    title={img?.writable ? 'Delete' : 'Built-in pictures cannot be deleted'}
                    disabled={!img?.writable}
                >
                    <Trash2 size={18} />
                </ToolButton>
                <div className="mx-1 h-6 w-px bg-gray-400" />
                <span className="text-xs">{Math.round(zoom * 100)}%</span>
            </div>
        </div>
    );
}

function ToolButton({ children, onClick, title, disabled }: { children: React.ReactNode; onClick: () => void; title: string; disabled?: boolean }) {
    return (
        <button
            onClick={onClick}
            title={title}
            aria-label={title}
            disabled={disabled}
            className="flex h-8 w-8 items-center justify-center border border-transparent bg-[#ece9d8] text-xs hover:border-gray-500 hover:bg-[#d9d6c4] active:translate-y-px disabled:text-gray-400 disabled:hover:border-transparent disabled:hover:bg-[#ece9d8]"
        >
            {children}
        </button>
    );
}

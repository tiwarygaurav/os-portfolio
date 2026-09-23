"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw, Trash2 } from 'lucide-react';
import { useSystemStore, type WindowPayload } from '@/store/useSystemStore';
import { SAMPLE_PICTURES_PATH, isFile, listDir, type VFile } from '@/system/vfs';
import { prettyPath } from '@/system/shell';
import { useFsRevision } from '@/utils/fs';
import { xpAlert, xpConfirm } from '@/utils/dialog';

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
const baseOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/** What is on screen: a folder, and the picture in it. Kept apart so the folder outlives its pictures. */
interface View {
    folder: string;
    name: string | null;
}

const viewOf = (path: string): View => ({ folder: dirOf(path), name: baseOf(path) });

export default function ImageViewerApp({ windowId, payload }: ImageViewerAppProps) {
    const actions = useSystemStore((s) => s.actions);
    const revision = useFsRevision();

    /*
     * The folder is state of its own. It used to be derived from the picture's path, so deleting the
     * last picture in My Pictures "showed" the folder itself — whose parent then became the folder,
     * and the viewer walked up into the visitor's home.
     */
    const [view, setView] = useState<View>(() =>
        payload?.path ? viewOf(payload.path) : { folder: SAMPLE_PICTURES_PATH, name: null },
    );
    const [zoom, setZoom] = useState(1);
    const [rotation, setRotation] = useState(0);
    const { folder } = view;

    // A later `open` on this window shows the new picture. Not on mount: that is the initial state.
    const openingPayload = useRef(payload);
    useEffect(() => {
        if (payload === openingPayload.current || !payload?.path) return;
        setView(viewOf(payload.path));
        setZoom(1);
        setRotation(0);
    }, [payload]);

    const pictures = useMemo(
        () => (listDir(folder) ?? []).filter((n): n is VFile => isFile(n) && Boolean(n.src)),
        // `revision` changes whenever a visitor file is written or deleted.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [folder, revision],
    );
    // The picture asked for, or — if it has gone (deleted from Explorer or the shell), or none was
    // named — the first one in the folder, rather than "no pictures" beside a folder that has some.
    const img = pictures.find((p) => p.name === view.name) ?? pictures[0];
    const index = img ? pictures.indexOf(img) : -1;
    const current = img ? `${folder === '/' ? '' : folder}/${img.name}` : null;

    useEffect(() => {
        if (!windowId) return;
        actions.setWindowTitle(windowId, img ? `${img.name} - Windows Picture and Fax Viewer` : 'Windows Picture and Fax Viewer');
    }, [windowId, img, actions]);

    const show = (i: number) => {
        if (!pictures.length) return;
        const next = pictures[(i + pictures.length) % pictures.length];
        setView({ folder, name: next.name });
        setZoom(1);
        setRotation(0);
    };

    /** To the Recycle Bin, as XP's viewer did; with Shift held, for good. */
    const remove = async (permanently = false) => {
        if (!img || !current) return;
        if (!img.writable) {
            await xpAlert('Error Deleting File or Folder', [
                `Cannot delete ${img.name}: it is read-only.`,
                'Only pictures you saved in /home/guest can be deleted.',
            ], 'error');
            return;
        }
        const question = permanently
            ? `Are you sure you want to delete '${img.name}'?`
            : `Are you sure you want to send '${img.name}' to the Recycle Bin?`;
        const ok = await xpConfirm('Confirm File Delete', question, {
            confirmLabel: 'Yes',
            cancelLabel: 'No',
            icon: 'warning',
        });
        if (!ok) return;
        const remaining = pictures.filter((p) => p !== img);
        const problem = permanently ? actions.deleteUserFile(current) : actions.recycleUserPath(current);
        if (problem) {
            void xpAlert('Windows Picture and Fax Viewer', [problem], 'error');
            return;
        }
        // The picture that slid into its place, as XP did; the folder stays even when it is empty.
        const next = remaining[Math.min(index, remaining.length - 1)];
        setView({ folder, name: next?.name ?? null });
        setZoom(1);
        setRotation(0);
    };

    return (
        <div
            // Focusable, so the viewer's keys work after a click on the picture. Keys it handles stop
            // here: Delete used to reach the desktop and offer to recycle a selected desktop icon.
            tabIndex={-1}
            onKeyDown={(e) => {
                const handled = e.key === 'Delete' || e.key === 'ArrowLeft' || e.key === 'ArrowRight';
                if (!handled) return;
                e.preventDefault();
                e.stopPropagation();
                if (e.key === 'Delete') void remove(e.shiftKey);
                else if (pictures.length > 1) show(index + (e.key === 'ArrowLeft' ? -1 : 1));
            }}
            className="flex h-full select-none flex-col bg-[#ece9d8] font-sans outline-none"
        >
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

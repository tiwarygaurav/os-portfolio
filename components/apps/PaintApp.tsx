"use client";

export default function PaintApp() {
    return (
        <div className="h-full w-full bg-[#c0c0c0] flex flex-col">
            <iframe
                src="https://jspaint.app"
                className="flex-1 w-full h-full border-none"
                title="Paint"
            />
        </div>
    );
}

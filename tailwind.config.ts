import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./posts/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                win: {
                    blue: "#245edb",
                    green: "#52c918",
                    orange: "#e98d19",
                    taskbar: "#245edb",
                    bg: "#55aaff",
                    gray: "#f0f0f0",
                    shadow: "#808080",
                    hightlight: "#ffffff",
                }
            },
            backgroundImage: {
                "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
                "gradient-conic":
                    "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
            },
        },
    },
    plugins: [],
};
export default config;

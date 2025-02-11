module.exports = {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            keyframes: {
                wave: {
                    "0%, 100%": { transform: "scaleY(1)" },
                    "50%": { transform: "scaleY(1.8)" },
                },
            },
            animation: {
                wave: "wave 1.2s infinite ease-in-out",
            },
        },
    },
    plugins: [],
};

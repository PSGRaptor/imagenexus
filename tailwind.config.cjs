module.exports = {
    content: [
        "./renderer/index.html",
        "./renderer/src/**/*.{ts,tsx}"
    ],
    darkMode: "class",
    theme: {
        extend: {
            colors: {
                brand: {
                    50: "#f2f7ff",
                    500: "#2b6cb0",
                    600: "#215893",
                    700: "#194472"
                }
            },
            borderRadius: {
                xl2: "1rem"
            }
        }
    },
    plugins: []
};

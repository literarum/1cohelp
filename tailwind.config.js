/** Production Tailwind build. See https://tailwindcss.com/docs/installation */
module.exports = {
    content: ['./site/index.html', './site/**/*.js', './site/templates/**/*.html'],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                primary: 'var(--color-primary, #9933FF)',
                secondary: 'var(--color-secondary, #7B2FDF)',
                blue: {
                    DEFAULT: 'var(--color-primary, #5D5CDE)',
                },
            },
            borderRadius: {
                none: '0px',
                sm: 'calc(var(--border-radius, 8px) * 0.5)',
                DEFAULT: 'var(--border-radius, 8px)',
                md: 'calc(var(--border-radius, 8px) * 0.75)',
                lg: 'calc(var(--border-radius, 8px) * 1.25)',
                xl: 'calc(var(--border-radius, 8px) * 1.75)',
                '2xl': 'calc(var(--border-radius, 8px) * 2.25)',
                '3xl': 'calc(var(--border-radius, 8px) * 3.0)',
                full: '9999px',
            },
            spacing: {
                content: 'var(--content-spacing, 1rem)',
                'content-sm': 'calc(var(--content-spacing, 1rem) * 0.75)',
                'content-lg': 'calc(var(--content-spacing, 1rem) * 1.5)',
            },
        },
    },
    plugins: [],
};

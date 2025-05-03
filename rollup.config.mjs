import pluginNodeResolve from '@rollup/plugin-node-resolve';

export default [
    {
        input: [
            'index.mjs',
            'type/files.mjs',
            'type/images.mjs',
            'type/media.mjs'
        ],
        output: {
            dir: 'dist/cjs',
            format: 'cjs',
            sourcemap: false,
            strict: false,
            preserveModules: true,
            exports: 'auto',
            entryFileNames: '[name].[format]',
            esModule: false
        },
        external: [
            'lo',
            'lo/errors',
            '@google-cloud/storage',
            '@tryghost/config',
            '@tryghost/errors',
            'ghost-storage-base'
        ],
        plugins: [
            pluginNodeResolve()
        ]
    }
];

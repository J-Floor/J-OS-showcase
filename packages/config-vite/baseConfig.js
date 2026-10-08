import solid from "vite-plugin-solid";

export function createBaseConfig(customConfig = {}) {
  const baseConfig = {
    plugins: [solid()],
    resolve: { tsconfigPaths: true },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
    server: {
      open: true,
    },
  };

  // Deep merge the base config with custom config
  return {
    ...baseConfig,
    ...customConfig,
    build: {
      ...baseConfig.build,
      ...customConfig.build,
      rollupOptions: {
        ...baseConfig.build?.rollupOptions,
        ...customConfig.build?.rollupOptions,
        output: {
          ...baseConfig.build?.rollupOptions?.output,
          ...customConfig.build?.rollupOptions?.output,
        },
      },
    },
  };
}

export default createBaseConfig;

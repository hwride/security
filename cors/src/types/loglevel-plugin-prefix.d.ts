declare module "loglevel-plugin-prefix" {
  import type loglevel = require("loglevel");

  interface PrefixOptions {
    format(level: string, name: string, timestamp: string): string;
  }

  const prefix: {
    reg(logger: typeof loglevel): void;
    apply(logger: typeof loglevel, options: PrefixOptions): void;
  };

  export = prefix;
}

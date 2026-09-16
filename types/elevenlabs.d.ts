import type * as React from "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "agent-id"?: string;
        },
        HTMLElement
      >;
    }
  }
}

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "elevenlabs-convai": React.DetailedHTMLProps<
          React.HTMLAttributes<HTMLElement> & {
            "agent-id"?: string;
          },
          HTMLElement
        >;
      }
    }
  }
  namespace JSX {
    interface IntrinsicElements {
      "elevenlabs-convai": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          "agent-id"?: string;
        },
        HTMLElement
      >;
    }
  }
}

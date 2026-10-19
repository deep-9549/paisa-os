import { ImageResponse } from "next/og";

// PNG app icons generated at build time (PWA manifest + apple-touch-icon).
export const dynamic = "force-static";

export function generateStaticParams() {
  return [{ file: "icon-192.png" }, { file: "icon-512.png" }, { file: "maskable-512.png" }];
}

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const size = file.includes("512") ? 512 : 192;
  const maskable = file.startsWith("maskable");
  const inner = maskable ? size * 0.62 : size * 0.86;
  return new ImageResponse(
    (
      <div style={{ width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center", background: maskable ? "#7c8cff" : "transparent" }}>
        <div
          style={{
            width: inner,
            height: inner,
            borderRadius: inner * 0.24,
            background: "#7c8cff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {/* Rupee sign drawn as a path (the default OG font has no ₹ glyph). */}
          <svg width={inner * 0.62} height={inner * 0.62} viewBox="0 0 100 100">
            <path d="M24 16 H78 M24 38 H78 M38 16 C72 16 72 60 38 60 H28 L70 92" fill="none" stroke="#0b0d12" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}

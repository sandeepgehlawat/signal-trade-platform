#!/usr/bin/env bun
/**
 * Signal Trade - Content Extractor
 *
 * Multi-source extraction supporting:
 * - YouTube videos (via yt-dlp)
 * - Twitter/X posts (API → fxtwitter → vxtwitter fallback)
 * - Articles (markdown.new → raw HTML)
 * - PDFs and screenshots (local processing)
 */

import type { ExtractedSource, ExtractionResult, SourceType } from "../types";

// ============================================================================
// URL CLASSIFICATION
// ============================================================================

export function classifyUrl(url: string): SourceType {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();
    const pathname = parsed.pathname.toLowerCase();

    // YouTube
    if (
      hostname.includes("youtube.com") ||
      hostname.includes("youtu.be") ||
      hostname.includes("youtube-nocookie.com")
    ) {
      return "youtube";
    }

    // Twitter/X
    if (
      hostname.includes("twitter.com") ||
      hostname.includes("x.com") ||
      hostname.includes("fxtwitter.com") ||
      hostname.includes("vxtwitter.com")
    ) {
      return "twitter";
    }

    // PDF
    if (pathname.endsWith(".pdf")) {
      return "pdf";
    }

    // Image/Screenshot
    if (/\.(png|jpg|jpeg|gif|webp)$/i.test(pathname)) {
      return "screenshot";
    }

    // Default to article
    return "article";
  } catch {
    return "text";
  }
}

// ============================================================================
// YOUTUBE EXTRACTION
// ============================================================================

interface YoutubeMeta {
  title: string;
  channel: string;
  channel_handle?: string;
  upload_date: string;
  duration_seconds: number;
  description: string;
  thumbnail?: string;
}

let ytDlpChecked = false;
let ytDlpAvailable = false;

async function checkYtDlp(): Promise<boolean> {
  if (ytDlpChecked) return ytDlpAvailable;

  try {
    const proc = Bun.spawn(["which", "yt-dlp"]);
    await proc.exited;
    ytDlpAvailable = proc.exitCode === 0;
    ytDlpChecked = true;

    if (!ytDlpAvailable) {
      console.warn(`
[extract] yt-dlp not found - YouTube extraction will not work
  Install with: brew install yt-dlp
  Or: pip install yt-dlp
`);
    }

    return ytDlpAvailable;
  } catch {
    ytDlpChecked = true;
    ytDlpAvailable = false;
    return false;
  }
}

// Export for testing
export { checkYtDlp };

async function fetchYoutubeMeta(url: string): Promise<YoutubeMeta | null> {
  try {
    const proc = Bun.spawn([
      "yt-dlp",
      "--dump-json",
      "--no-download",
      "--no-warnings",
      url,
    ]);

    const output = await new Response(proc.stdout).text();
    await proc.exited;

    if (proc.exitCode !== 0) return null;

    const data = JSON.parse(output);
    return {
      title: data.title || "Untitled",
      channel: data.channel || data.uploader || "Unknown",
      channel_handle: data.uploader_id,
      upload_date: formatYtDate(data.upload_date),
      duration_seconds: data.duration || 0,
      description: (data.description || "").slice(0, 2000),
      thumbnail: data.thumbnail,
    };
  } catch (e) {
    console.error("YouTube metadata fetch failed:", e);
    return null;
  }
}

function formatYtDate(dateStr: string): string {
  // yt-dlp returns YYYYMMDD format
  if (!dateStr || dateStr.length !== 8) return new Date().toISOString();
  const year = dateStr.slice(0, 4);
  const month = dateStr.slice(4, 6);
  const day = dateStr.slice(6, 8);
  return `${year}-${month}-${day}T00:00:00Z`;
}

async function extractYoutubeTranscript(url: string): Promise<string | null> {
  try {
    const tempDir = `/tmp/signal-trade-${Date.now()}`;
    await Bun.spawn(["mkdir", "-p", tempDir]).exited;

    const proc = Bun.spawn([
      "yt-dlp",
      "--write-auto-sub",
      "--sub-format",
      "json3",
      "--skip-download",
      "--no-warnings",
      "-o",
      `${tempDir}/%(id)s`,
      url,
    ]);

    await proc.exited;

    // Find the subtitle file
    const files = await Array.fromAsync(
      new Bun.Glob("*.json3").scan({ cwd: tempDir })
    );

    if (files.length === 0) return null;

    const subContent = await Bun.file(`${tempDir}/${files[0]}`).text();
    const subData = JSON.parse(subContent);

    // Parse json3 format into plain text
    const segments: string[] = [];
    for (const event of subData.events || []) {
      if (event.segs) {
        const text = event.segs.map((s: { utf8?: string }) => s.utf8 || "").join("");
        if (text.trim()) segments.push(text.trim());
      }
    }

    // Cleanup
    await Bun.spawn(["rm", "-rf", tempDir]).exited;

    return segments.join(" ");
  } catch (e) {
    console.error("Transcript extraction failed:", e);
    return null;
  }
}

async function extractYoutube(url: string): Promise<ExtractionResult> {
  if (!(await checkYtDlp())) {
    return {
      success: false,
      error: "yt-dlp not installed. Run: brew install yt-dlp",
    };
  }

  const meta = await fetchYoutubeMeta(url);
  if (!meta) {
    return { success: false, error: "Failed to fetch YouTube metadata" };
  }

  const transcript = await extractYoutubeTranscript(url);
  const text = transcript || meta.description;

  return {
    success: true,
    source: {
      url,
      source_type: "youtube",
      title: meta.title,
      author: meta.channel,
      author_handle: meta.channel_handle,
      publish_date: meta.upload_date,
      duration_seconds: meta.duration_seconds,
      text,
      transcript: transcript || undefined,
      images: meta.thumbnail ? [meta.thumbnail] : [],
      word_count: text.split(/\s+/).length,
    },
  };
}

// ============================================================================
// TWITTER EXTRACTION
// ============================================================================

interface TweetData {
  text: string;
  author: string;
  author_handle: string;
  author_avatar?: string;
  created_at: string;
  images?: string[];
  quoted_text?: string;
}

async function extractTweetViaFxTwitter(url: string): Promise<TweetData | null> {
  try {
    // Convert x.com/twitter.com URL to fxtwitter API format
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/");
    const statusIndex = pathParts.indexOf("status");
    if (statusIndex === -1) return null;

    const username = pathParts[statusIndex - 1];
    const tweetId = pathParts[statusIndex + 1];

    const apiUrl = `https://api.fxtwitter.com/${username}/status/${tweetId}`;
    const response = await fetch(apiUrl);

    if (!response.ok) return null;

    const data = await response.json();
    const tweet = data.tweet;

    return {
      text: tweet.text,
      author: tweet.author.name,
      author_handle: tweet.author.screen_name,
      author_avatar: tweet.author.avatar_url,
      created_at: tweet.created_at,
      images: tweet.media?.photos?.map((p: { url: string }) => p.url) || [],
      quoted_text: tweet.quote?.text,
    };
  } catch (e) {
    console.error("[extractTweetViaFxTwitter] Error:", e);
    return null;
  }
}

async function extractTweetViaVxTwitter(url: string): Promise<TweetData | null> {
  try {
    // vxtwitter oembed fallback
    const oembedUrl = `https://api.vxtwitter.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await fetch(oembedUrl);

    if (!response.ok) return null;

    const data = await response.json();

    // vxtwitter oembed has limited data
    return {
      text: data.title || "",
      author: data.author_name || "Unknown",
      author_handle: data.author_url?.split("/").pop() || "",
      created_at: new Date().toISOString(),
    };
  } catch (e) {
    console.error("[extractTweetViaVxTwitter] Error:", e);
    return null;
  }
}

async function extractTwitter(url: string): Promise<ExtractionResult> {
  // Try fxtwitter first, then vxtwitter
  let tweet = await extractTweetViaFxTwitter(url);
  if (!tweet) {
    tweet = await extractTweetViaVxTwitter(url);
  }

  if (!tweet) {
    return { success: false, error: "Failed to extract tweet" };
  }

  const fullText = tweet.quoted_text
    ? `${tweet.text}\n\nQuoted: ${tweet.quoted_text}`
    : tweet.text;

  return {
    success: true,
    source: {
      url,
      source_type: "twitter",
      title: `Tweet by @${tweet.author_handle}`,
      author: tweet.author,
      author_handle: tweet.author_handle,
      author_avatar: tweet.author_avatar,
      publish_date: tweet.created_at,
      text: fullText,
      images: tweet.images,
      word_count: fullText.split(/\s+/).length,
    },
  };
}

// ============================================================================
// ARTICLE EXTRACTION
// ============================================================================

async function extractViaMarkdownNew(url: string): Promise<string | null> {
  try {
    const apiUrl = `https://markdown.new/api/v1/convert?url=${encodeURIComponent(url)}`;
    const response = await fetch(apiUrl);

    if (!response.ok) return null;

    const data = await response.json();
    return data.markdown || data.content || null;
  } catch (e) {
    console.error("[extractViaMarkdownNew] Error:", e);
    return null;
  }
}

async function extractViaRawHtml(url: string): Promise<{ text: string; meta: Record<string, string> } | null> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SignalTrade/1.0)",
      },
    });

    if (!response.ok) return null;

    const html = await response.text();

    // Extract metadata
    const meta: Record<string, string> = {};

    // Title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) meta.title = titleMatch[1].trim();

    // OpenGraph
    const ogMatches = html.matchAll(/<meta\s+property="og:([^"]+)"\s+content="([^"]+)"/gi);
    for (const m of ogMatches) {
      meta[`og_${m[1]}`] = m[2];
    }

    // Twitter Card
    const twMatches = html.matchAll(/<meta\s+name="twitter:([^"]+)"\s+content="([^"]+)"/gi);
    for (const m of twMatches) {
      meta[`tw_${m[1]}`] = m[2];
    }

    // Author
    const authorMatch = html.match(/<meta\s+name="author"\s+content="([^"]+)"/i);
    if (authorMatch) meta.author = authorMatch[1];

    // Strip HTML tags for text content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    const bodyHtml = bodyMatch ? bodyMatch[1] : html;

    // Remove scripts, styles, nav, footer
    let text = bodyHtml
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return { text, meta };
  } catch (e) {
    console.error("[extractViaRawHtml] Error:", e);
    return null;
  }
}

async function extractArticle(url: string): Promise<ExtractionResult> {
  // Try markdown.new first
  let text = await extractViaMarkdownNew(url);
  let meta: Record<string, string> = {};

  if (!text) {
    const rawResult = await extractViaRawHtml(url);
    if (!rawResult) {
      return { success: false, error: "Failed to extract article content" };
    }
    text = rawResult.text;
    meta = rawResult.meta;
  }

  return {
    success: true,
    source: {
      url,
      source_type: "article",
      title: meta.og_title || meta.tw_title || meta.title,
      author: meta.author || meta.og_site_name,
      publish_date: meta.og_published_time || meta.article_published_time,
      text,
      images: meta.og_image ? [meta.og_image] : [],
      word_count: text.split(/\s+/).length,
      metadata: meta,
    },
  };
}

// ============================================================================
// PDF EXTRACTION
// ============================================================================

async function extractPdf(url: string): Promise<ExtractionResult> {
  try {
    // Download PDF to temp file
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SignalTrade/1.0)",
      },
    });

    if (!response.ok) {
      return { success: false, error: `Failed to download PDF: ${response.status}` };
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("pdf")) {
      return { success: false, error: "URL does not point to a PDF file" };
    }

    const buffer = await response.arrayBuffer();
    const tempPath = `/tmp/signal-trade-pdf-${Date.now()}.pdf`;
    await Bun.write(tempPath, buffer);

    // Try to extract text using pdftotext (poppler)
    // Falls back to basic binary extraction if not available
    let text = "";
    let extractionMethod = "fallback";

    try {
      // Check if pdftotext is available
      const checkProc = Bun.spawn(["which", "pdftotext"]);
      await checkProc.exited;

      if (checkProc.exitCode === 0) {
        const proc = Bun.spawn(["pdftotext", "-layout", tempPath, "-"]);
        text = await new Response(proc.stdout).text();
        await proc.exited;
        extractionMethod = "pdftotext";
      }
    } catch {
      // pdftotext not available
    }

    // Fallback: try to extract readable strings from PDF
    if (!text || text.trim().length < 50) {
      const rawText = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
      // Extract text between stream objects (very basic)
      const textMatches = rawText.match(/\(([^)]+)\)/g) || [];
      text = textMatches
        .map((m) => m.slice(1, -1))
        .filter((s) => s.length > 3 && /[a-zA-Z]/.test(s))
        .join(" ");
      extractionMethod = "fallback";
    }

    // Clean up temp file
    await Bun.spawn(["rm", "-f", tempPath]).exited;

    if (!text || text.trim().length < 20) {
      return {
        success: false,
        error: "Could not extract text from PDF. Install poppler-utils: brew install poppler",
      };
    }

    // Clean up text
    text = text
      .replace(/\s+/g, " ")
      .replace(/[^\x20-\x7E\n]/g, "")
      .trim();

    // Extract title from URL or first line
    const filename = url.split("/").pop()?.replace(".pdf", "") || "PDF Document";
    const title = text.split(/[.\n]/)[0]?.slice(0, 100) || filename;

    return {
      success: true,
      source: {
        url,
        source_type: "pdf",
        title,
        text,
        word_count: text.split(/\s+/).length,
        metadata: {
          extraction_method: extractionMethod,
        },
      },
    };
  } catch (e) {
    console.error("[extractPdf] Error:", e);
    return { success: false, error: `PDF extraction failed: ${e}` };
  }
}

// ============================================================================
// TEXT EXTRACTION (Direct input)
// ============================================================================

function extractText(input: string): ExtractionResult {
  return {
    success: true,
    source: {
      url: "",
      source_type: "text",
      text: input,
      word_count: input.split(/\s+/).length,
    },
  };
}

// ============================================================================
// MAIN EXTRACTOR
// ============================================================================

export async function extract(input: string): Promise<ExtractionResult> {
  // Check if input is a URL or raw text
  const isUrl = /^https?:\/\//i.test(input.trim());

  if (!isUrl) {
    return extractText(input);
  }

  const url = input.trim();
  const sourceType = classifyUrl(url);

  switch (sourceType) {
    case "youtube":
      return extractYoutube(url);
    case "twitter":
      return extractTwitter(url);
    case "article":
      return extractArticle(url);
    case "pdf":
      return extractPdf(url);
    case "screenshot":
      return { success: false, error: "Screenshot extraction requires vision API - not yet implemented" };
    default:
      return extractText(input);
  }
}

// ============================================================================
// CLI INTERFACE
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: bun run extract.ts <url-or-text>");
    process.exit(1);
  }

  const input = args.join(" ");
  const result = await extract(input);

  console.log(JSON.stringify(result, null, 2));

  if (!result.success) {
    process.exit(1);
  }
}

// Only run CLI if this is the main module
if (import.meta.main) {
  main();
}

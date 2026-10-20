"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CHAT_PHOTO_BUCKET, CHAT_PHOTO_TYPES, MAX_CHAT_PHOTO_BYTES } from "@/lib/chat";
import { createClient } from "@/lib/supabase/client";
import { sendChatMessage } from "./actions";
import { useChatRoom } from "./room";

// A small built-in picker: the emoji people use most in chats.
const EMOJI = [
  "😀", "😂", "🥹", "😊", "😍", "🥰", "😘", "😉", "😎", "🤔",
  "😅", "😭", "😤", "😈", "🙈", "🤗", "😴", "🥲", "🤭", "🙃",
  "❤️", "💕", "🔥", "✨", "👍", "👏", "🙌", "🎉", "💯", "🙏",
  "☕", "🍜", "🍕", "🍣", "🍷", "🎬", "🎧", "🏖️", "🥾", "🐶",
];

type Photo = { previewUrl: string; path: string | null; uploading: boolean };

// The message bar at the bottom of the chat: a pill-shaped box that grows with
// the text, and a round send button. Enter sends; Shift+Enter adds a new line.
// While the chat is young, the report's "questions to ask" show as starters.
// When it has gone quiet for a couple of days, a topic is offered instead:
// something the twins talked about that you haven't, with a line to send.
export function ChatComposer({
  conversationId,
  starters = [],
  quiet = null,
}: {
  conversationId: string;
  starters?: string[];
  quiet?: { days: number; topics: { intro: string | null; line: string }[] } | null;
}) {
  const [text, setText] = useState("");
  const [topic, setTopic] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const box = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const { notifyTyping } = useChatRoom();

  // Free the preview's memory when it's replaced or the page closes (not when
  // the same photo just finishes uploading).
  const previewUrl = photo?.previewUrl;
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Uploads a picked photo straight to this chat's folder; it's sent with the next message.
  async function attach(file: File) {
    setError(null);
    const ext = CHAT_PHOTO_TYPES[file.type];
    if (!ext) return setError("Send a JPEG, PNG, WebP or GIF.");
    if (file.size > MAX_CHAT_PHOTO_BYTES) return setError("That photo is over 8 MB. Try a smaller one.");
    const previewUrl = URL.createObjectURL(file);
    setPhoto({ previewUrl, path: null, uploading: true });
    const path = `${conversationId}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await createClient()
      .storage.from(CHAT_PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type });
    if (uploadError) {
      setPhoto(null);
      setError(`Couldn't upload the photo: ${uploadError.message}`);
      return;
    }
    setPhoto({ previewUrl, path, uploading: false });
  }

  // Puts an emoji where the cursor is.
  function insertEmoji(emoji: string) {
    const el = box.current;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
      resize();
    });
  }

  function resize() {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  const canSend = Boolean(text.trim() || (photo?.path && !photo.uploading));

  function send() {
    const content = text.trim();
    if (!canSend || pending) return;
    setError(null);
    setEmojiOpen(false);
    startTransition(async () => {
      const result = await sendChatMessage(conversationId, content, photo?.path ?? null);
      if (result) {
        setError(result.error);
      } else {
        setText("");
        setPhoto(null);
        requestAnimationFrame(resize);
      }
    });
  }

  function fill(value: string) {
    setText(value);
    requestAnimationFrame(() => {
      resize();
      box.current?.focus();
    });
  }

  const showQuiet = quiet && quiet.topics.length > 0 && !dismissed;
  const current = showQuiet ? quiet.topics[topic % quiet.topics.length] : null;

  return (
    <div className="border-t border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
      {current && (
        <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold">It&apos;s been {quiet!.days} days. Something to talk about?</p>
            <button
              onClick={() => setDismissed(true)}
              aria-label="Dismiss"
              className="-mr-1 -mt-0.5 rounded-full px-1.5 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
            >
              ×
            </button>
          </div>
          {current.intro && <p className="mt-0.5">{current.intro}</p>}
          <p className="mt-1 font-medium">“{current.line}”</p>
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                fill(current.line);
                setDismissed(true);
              }}
              className="rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-black"
            >
              Ask this
            </button>
            {quiet!.topics.length > 1 && (
              <button
                onClick={() => setTopic((t) => t + 1)}
                className="rounded-full border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-900"
              >
                Another one
              </button>
            )}
          </div>
        </div>
      )}
      {starters.length > 0 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {starters.map((s) => (
            <button
              key={s}
              onClick={() => {
                setText(s);
                requestAnimationFrame(() => {
                  resize();
                  box.current?.focus();
                });
              }}
              className="shrink-0 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      {photo && (
        <div className="mb-3 flex items-center gap-3">
          <span className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.previewUrl} alt="Photo to send" className="h-20 w-20 rounded-xl object-cover" />
            {photo.uploading && (
              <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/40 text-xs font-medium text-white">
                Uploading…
              </span>
            )}
            <button
              onClick={() => setPhoto(null)}
              aria-label="Remove photo"
              className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black text-sm text-white dark:bg-white dark:text-black"
            >
              ×
            </button>
          </span>
          <span className="text-xs text-zinc-500">Add a message if you like, then send.</span>
        </div>
      )}
      {emojiOpen && (
        <div className="mb-3 grid grid-cols-10 gap-1 rounded-2xl border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950">
          {EMOJI.map((e) => (
            <button
              key={e}
              onClick={() => insertEmoji(e)}
              className="rounded-lg py-1 text-xl hover:bg-zinc-100 dark:hover:bg-zinc-900"
              aria-label={`Add ${e}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-1.5">
        <button
          onClick={() => setEmojiOpen((o) => !o)}
          aria-label="Emoji"
          aria-expanded={emojiOpen}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xl hover:bg-zinc-100 dark:hover:bg-zinc-900 ${
            emojiOpen ? "bg-zinc-100 dark:bg-zinc-900" : ""
          }`}
        >
          😊
        </button>
        <button
          onClick={() => fileInput.current?.click()}
          aria-label="Add a photo"
          disabled={pending || photo?.uploading}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 hover:text-black disabled:opacity-50 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="3" />
            <circle cx="9" cy="10" r="1.6" />
            <path d="M21 16l-5-5-8 8" strokeLinejoin="round" />
          </svg>
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={Object.keys(CHAT_PHOTO_TYPES).join(",")}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) attach(file);
            e.target.value = "";
          }}
        />
        <textarea
          ref={box}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            resize();
            if (e.target.value.trim()) notifyTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="Message…"
          className="max-h-40 min-w-0 flex-1 resize-none rounded-3xl border border-zinc-300 bg-zinc-50 px-4 py-2.5 text-sm text-black outline-none focus:border-zinc-500 focus:bg-white dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:focus:bg-zinc-950"
        />
        <button
          onClick={send}
          disabled={pending || !canSend}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-violet-500 text-white transition hover:bg-violet-600 disabled:bg-zinc-300 dark:disabled:bg-zinc-700"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
            <path d="M12 19V5M6 11l6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
      {error && <p className="mt-2 px-2 text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

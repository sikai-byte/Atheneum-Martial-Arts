import { toggleReaction } from "@/lib/actions";
import { REACTION_EMOJIS } from "@/lib/reactions";

export type ReactionSummary = { emoji: string; userId: string };

export default function ReactionBar({
  postId,
  reactions,
  userId,
}: {
  postId: string;
  reactions: ReactionSummary[];
  userId: string;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {REACTION_EMOJIS.map((emoji) => {
        const count = reactions.filter((r) => r.emoji === emoji).length;
        const mine = reactions.some((r) => r.emoji === emoji && r.userId === userId);
        return (
          <form key={emoji} action={toggleReaction.bind(null, postId, emoji)}>
            <button
              type="submit"
              aria-pressed={mine}
              aria-label={`React with ${emoji}`}
              className={`flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition ${
                mine
                  ? "border-brand bg-brand/10 font-semibold text-brand"
                  : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
              }`}
            >
              <span>{emoji}</span>
              {count > 0 && <span className="text-xs">{count}</span>}
            </button>
          </form>
        );
      })}
    </div>
  );
}

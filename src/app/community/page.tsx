import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { formatDay, formatTime } from "@/lib/format";
import { deletePost, addComment, deleteComment } from "@/lib/actions";
import SubmitButton from "@/components/SubmitButton";
import NewPostForm from "@/components/NewPostForm";
import ReactionBar from "@/components/ReactionBar";
import PostMediaGallery, { type GalleryItem } from "@/components/PostMediaGallery";
import EditablePost from "@/components/EditablePost";
import Linkify from "@/components/Linkify";

export const dynamic = "force-dynamic";

const categoryLabels: Record<string, string> = {
  GENERAL: "General",
  QUESTION: "Question",
  NEWS: "News",
};

const categoryStyles: Record<string, string> = {
  GENERAL: "bg-stone-100 text-stone-700",
  QUESTION: "bg-purple-100 text-purple-800",
  NEWS: "bg-blue-100 text-blue-800",
};

export default async function CommunityPage() {
  const user = await requireUser();
  const isStaff = user.role === "COACH" || user.role === "ADMIN";

  const posts = await prisma.post.findMany({
    include: {
      author: { select: { id: true, name: true, role: true } },
      media: { orderBy: { position: "asc" } },
      reactions: { select: { emoji: true, userId: true } },
      comments: {
        include: { author: { select: { id: true, name: true, role: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div className="space-y-8">
      <section>
        <h1 className="text-2xl font-bold tracking-tight">Community</h1>
        <p className="mt-1 text-stone-600">
          Share pictures, ask questions, and post news for the whole Atheneum tribe.
        </p>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5" aria-labelledby="new-post">
        <h2 id="new-post" className="text-lg font-semibold">
          Start a post
        </h2>
        <NewPostForm />
      </section>

      <section aria-labelledby="feed">
        <h2 id="feed" className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Latest posts
        </h2>
        {posts.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-sm text-stone-500">
            No posts yet — be the first to share something with the tribe!
          </p>
        ) : (
          <div className="mt-2 space-y-4">
            {posts.map((post) => {
              const canDeletePost = isStaff || post.author.id === user.id;
              const galleryItems: GalleryItem[] = [
                ...(post.photoType
                  ? [
                      {
                        src: `/api/post-photo/${post.id}`,
                        kind: "IMAGE" as const,
                        alt: post.title || "Community post photo",
                      },
                    ]
                  : []),
                ...post.media.map((m) => ({
                  src: `/api/post-media/${m.id}`,
                  kind: m.kind === "VIDEO" ? ("VIDEO" as const) : ("IMAGE" as const),
                  alt: post.title || "Community post photo",
                })),
              ];
              return (
                <article key={post.id} className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            categoryStyles[post.category] ?? categoryStyles.GENERAL
                          }`}
                        >
                          {categoryLabels[post.category] ?? "General"}
                        </span>
                        <p className="text-sm font-semibold">{post.author.name}</p>
                        {(post.author.role === "COACH" || post.author.role === "ADMIN") && (
                          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                            Staff
                          </span>
                        )}
                        <p className="text-xs text-stone-400">
                          {formatDay(post.createdAt)} · {formatTime(post.createdAt)}
                        </p>
                      </div>
                      <EditablePost
                        postId={post.id}
                        title={post.title}
                        body={post.body}
                        category={post.category}
                        canEdit={post.author.id === user.id}
                        editedLabel={
                          post.editedAt
                            ? `Edited ${formatDay(post.editedAt)} · ${formatTime(post.editedAt)}`
                            : null
                        }
                      />
                    </div>
                    {canDeletePost && (
                      <form action={deletePost.bind(null, post.id)}>
                        <SubmitButton
                          pendingLabel="Deleting…"
                          ariaLabel="Delete post"
                          className="text-xs text-stone-400 hover:text-red-600"
                        >
                          Delete
                        </SubmitButton>
                      </form>
                    )}
                  </div>

                  {galleryItems.length > 0 && <PostMediaGallery items={galleryItems} />}

                  <ReactionBar postId={post.id} reactions={post.reactions} userId={user.id} />

                  <div className="mt-4 border-t border-stone-100 pt-3">
                    {post.comments.length > 0 && (
                      <ul className="space-y-2">
                        {post.comments.map((c) => {
                          const canDeleteComment = isStaff || c.author.id === user.id;
                          return (
                            <li key={c.id} className="flex items-start justify-between gap-3">
                              <p className="min-w-0 flex-1 text-sm">
                                <span className="font-medium">{c.author.name}</span>{" "}
                                <span className="text-stone-600">
                                  <Linkify text={c.body} />
                                </span>
                              </p>
                              {canDeleteComment && (
                                <form action={deleteComment.bind(null, c.id)}>
                                  <SubmitButton
                                    pendingLabel="Deleting…"
                                    ariaLabel="Delete comment"
                                    className="text-xs text-stone-400 hover:text-red-600"
                                  >
                                    Delete
                                  </SubmitButton>
                                </form>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <form
                      action={addComment.bind(null, post.id)}
                      className={`flex gap-2 ${post.comments.length > 0 ? "mt-3" : ""}`}
                    >
                      <input
                        name="body"
                        required
                        maxLength={2000}
                        placeholder="Write a comment…"
                        className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
                      />
                      <SubmitButton
                        pendingLabel="Posting…"
                        className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
                      >
                        Reply
                      </SubmitButton>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

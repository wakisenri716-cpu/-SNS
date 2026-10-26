// Shimmering placeholders shown while the feed loads, shaped like FeedPost.
export default function FeedSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="mx-auto max-w-[470px]" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="pb-6">
          <div className="flex items-center gap-3 px-3 py-3 md:px-0">
            <span className="skeleton h-9 w-9 rounded-full" />
            <span className="flex flex-col gap-1.5">
              <span className="skeleton h-3 w-28 rounded-full" />
              <span className="skeleton h-2.5 w-20 rounded-full" />
            </span>
          </div>
          <div className="skeleton aspect-[4/5] w-full md:rounded-2xl" />
          <div className="flex flex-col gap-2 px-3 pt-4 md:px-0">
            <span className="skeleton h-3 w-24 rounded-full" />
            <span className="skeleton h-3 w-4/5 rounded-full" />
            <span className="skeleton h-3 w-3/5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

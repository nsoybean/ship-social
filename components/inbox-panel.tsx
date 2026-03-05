"use client";

import type { KeyboardEvent, MouseEvent } from "react";

type PrioritizedInboxItem = {
  id: string;
  draftId: string;
  title: string;
  body: string;
  createdAt?: string;
  draftStatus: string;
  statusLabel: string;
  needsAttention: boolean;
};

type InboxPanelProps = {
  items: PrioritizedInboxItem[];
  activeDraftId: string;
  onSelectDraft: (draftId: string) => void;
  deletingId: string;
  onDeleteItem: (itemId: string, draftId: string) => void;
  onOpenRepos: () => void;
  showGeneratingSkeleton?: boolean;
};

function formatTime(value: string | null | undefined) {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return date.toLocaleString();
}

export default function InboxPanel({
  items,
  activeDraftId,
  onSelectDraft,
  deletingId,
  onDeleteItem,
  onOpenRepos,
  showGeneratingSkeleton = false
}: InboxPanelProps) {
  return (
    <article className="panel inbox-panel">
      <div className="panel-head">
        <h3>Inbox</h3>
        <span className="tiny">{items.length} items</span>
      </div>
      <div className="inbox-list">
        {showGeneratingSkeleton ? (
          <article className="inbox-item inbox-item-skeleton" aria-live="polite" aria-label="Generating draft">
            <div className="inbox-item-main">
              <span className="inbox-skeleton-line inbox-skeleton-line-title" />
              <span className="inbox-skeleton-line inbox-skeleton-line-body" />
              <span className="inbox-skeleton-line inbox-skeleton-line-time" />
            </div>
            <div className="inbox-item-side">
              <span className="inbox-skeleton-pill" />
            </div>
          </article>
        ) : null}
        {items.length === 0 && !showGeneratingSkeleton ? (
          <div className="empty-inbox">
            <p className="soft">
              No draft events yet. Open <strong>Repos</strong> to connect a repository and run a manual trigger.
            </p>
            <button className="btn btn-compact" onClick={onOpenRepos}>
              Open Repos
            </button>
          </div>
        ) : (
          items.map((item) => (
            <article
              key={item.id}
              className={`inbox-item ${activeDraftId === item.draftId ? "active" : ""} ${item.needsAttention ? "needs-attention" : "resolved"}`}
              role="button"
              tabIndex={0}
              aria-label={`Open draft ${item.title}`}
              onClick={() => onSelectDraft(item.draftId)}
              onKeyDown={(event: KeyboardEvent<HTMLElement>) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectDraft(item.draftId);
                }
              }}
            >
              <div className="inbox-item-main">
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                <span>{formatTime(item.createdAt)}</span>
              </div>
              <div className="inbox-item-side">
                <span className={`inbox-status inbox-status-${item.draftStatus}`}>
                  {item.statusLabel}
                </span>
                <div className="inbox-item-actions">
                  <button
                    className="btn btn-compact"
                    onClick={(event: MouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      onSelectDraft(item.draftId);
                    }}
                  >
                    Open
                  </button>
                  <button
                    className="btn btn-compact inbox-delete-btn"
                    disabled={deletingId === item.id}
                    onClick={(event: MouseEvent<HTMLButtonElement>) => {
                      event.stopPropagation();
                      onDeleteItem(item.id, item.draftId);
                    }}
                  >
                    {deletingId === item.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </article>
  );
}

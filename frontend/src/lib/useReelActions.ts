import type { Dispatch, SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { notifySavesChanged } from "./savesChanged";
import { showToast } from "./toast";
import type { Reel } from "../types";

// Like / save / follow / comment-count handlers for a page holding its own
// list of reels (the リール and 地図 pages). Signed-out taps go to login.
export function useReelActions(setReels: Dispatch<SetStateAction<Reel[]>>) {
  const { token } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  async function toggleLike(reel: Reel) {
    if (!token) return navigate("/login");
    if (reel.likedByMe) await api.delete(`/reels/${reel.id}/like`);
    else await api.post(`/reels/${reel.id}/like`);
    setReels((prev) =>
      prev.map((r) => (r.id === reel.id ? { ...r, likedByMe: !r.likedByMe, likeCount: r.likeCount + (r.likedByMe ? -1 : 1) } : r))
    );
  }

  async function toggleSave(reel: Reel) {
    if (!token) return navigate("/login");
    if (reel.savedByMe) await api.delete(`/reels/${reel.id}/save`);
    else await api.post(`/reels/${reel.id}/save`);
    notifySavesChanged();
    if (!reel.savedByMe) showToast(t("feed.savedToast"), { label: t("feed.savedToastAction"), to: "/itinerary" });
    setReels((prev) => prev.map((r) => (r.id === reel.id ? { ...r, savedByMe: !r.savedByMe } : r)));
  }

  async function toggleFollow(reel: Reel) {
    if (!token) return navigate("/login");
    const target = reel.postedByCompany ?? reel.municipality;
    const kind = reel.postedByCompany ? "companies" : "municipalities";
    if (target.isFollowing) await api.delete(`/${kind}/${target.id}/follow`);
    else await api.post(`/${kind}/${target.id}/follow`);
    setReels((prev) =>
      prev.map((r) => {
        const rTarget = r.postedByCompany ?? r.municipality;
        if (rTarget.id !== target.id) return r;
        return r.postedByCompany
          ? { ...r, postedByCompany: { ...r.postedByCompany, isFollowing: !target.isFollowing } }
          : { ...r, municipality: { ...r.municipality, isFollowing: !target.isFollowing } };
      })
    );
  }

  function setCommentCount(reelId: string, count: number) {
    setReels((prev) => prev.map((r) => (r.id === reelId ? { ...r, commentCount: count } : r)));
  }

  return { toggleLike, toggleSave, toggleFollow, setCommentCount };
}

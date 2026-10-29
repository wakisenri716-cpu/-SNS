import type { Dispatch, SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { chooseTrips } from "./trips";
import type { Reel } from "../types";

// Like / save / follow / comment-count handlers for a page holding its own
// list of reels (the リール and 地図 pages). Signed-out taps go to login.
export function useReelActions(setReels: Dispatch<SetStateAction<Reel[]>>) {
  const { token } = useAuth();
  const navigate = useNavigate();

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
    // Which trip(s) it goes in is chosen in the "どの旅に入れる？" sheet.
    const saved = await chooseTrips([reel.id], reel.locationName || reel.municipality.name);
    setReels((prev) => prev.map((r) => (r.id === reel.id ? { ...r, savedByMe: saved } : r)));
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

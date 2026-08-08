import { useContext, useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { toast } from "sonner";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";
import { FiMoreHorizontal } from "react-icons/fi";
import { AuthContext } from "../contexts/AuthContext/AuthContext";
import api, { resolveApiUrl } from "../api";

function Moments() {
  const { user } = useContext(AuthContext);
  const [tab, setTab] = useState("feed");
  const [moments, setMoments] = useState([]);
  const [loadingList, setLoadingList] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState("");
  const [draftCaption, setDraftCaption] = useState("");
  const [usernamesById, setUsernamesById] = useState({});
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerMenuOpen, setViewerMenuOpen] = useState(false);
  const [activeGroupIndex, setActiveGroupIndex] = useState(0);
  const [activeStoryIndex, setActiveStoryIndex] = useState(0);
  const fileInputRef = useRef();

  const resolveImg = (url) => {
    return resolveApiUrl(url);
  };

  const ensureUsernames = async (momentList) => {
    const uniqueIds = [...new Set(momentList.map((m) => m.userId).filter(Boolean))];

    setUsernamesById((prev) => {
      const missingIds = uniqueIds.filter((id) => !prev[id]);
      if (missingIds.length === 0) return prev;

      Promise.all(
        missingIds.map(async (id) => {
          try {
            const res = await api.get(`/v1/users/${id}`);
            const profile = res.data?.user || res.data;
            return [id, profile?.username || `user-${id.slice(0, 6)}`];
          } catch {
            return [id, `user-${id.slice(0, 6)}`];
          }
        })
      ).then((entries) => {
        setUsernamesById((curr) => ({ ...curr, ...Object.fromEntries(entries) }));
      });

      return prev;
    });
  };

  const loadMoments = async (activeTab = tab) => {
    try {
      setLoadingList(true);
      const endpoint = activeTab === "archive" ? "/v1/moments/archive" : "/v1/moments/feed";
      const res = await api.get(endpoint);
      const list = Array.isArray(res.data) ? res.data : res.data?.moments || [];
      setMoments(list);
      ensureUsernames(list);
    } catch {
      toast.error("Failed to load moments");
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    loadMoments(tab);
  }, [tab]);

  const sortedMoments = [...moments].sort((a, b) => {
    const aTime = new Date(a.createdAt || 0).getTime();
    const bTime = new Date(b.createdAt || 0).getTime();
    return bTime - aTime;
  });

  const grouped = new Map();
  sortedMoments.forEach((moment) => {
    if (!grouped.has(moment.userId)) grouped.set(moment.userId, []);
    grouped.get(moment.userId).push(moment);
  });

  const storyGroups = Array.from(grouped.entries()).map(([userId, userMoments]) => ({
    userId,
    moments: userMoments,
  }));

  const activeGroup = storyGroups[activeGroupIndex];
  const activeMoment = activeGroup?.moments?.[activeStoryIndex];

  useEffect(() => {
    if (!viewerOpen || tab !== "feed" || !activeMoment) return;

    const timer = window.setTimeout(() => {
      if (activeStoryIndex < activeGroup.moments.length - 1) {
        setActiveStoryIndex((prev) => prev + 1);
      } else if (activeGroupIndex < storyGroups.length - 1) {
        setActiveGroupIndex((prev) => prev + 1);
        setActiveStoryIndex(0);
      } else {
        setViewerOpen(false);
      }
    }, 6500);

    return () => window.clearTimeout(timer);
  }, [viewerOpen, tab, activeMoment, activeStoryIndex, activeGroup, activeGroupIndex, storyGroups.length]);

  useEffect(() => {
    if (!viewerOpen) return;
    if (storyGroups.length === 0) {
      setViewerOpen(false);
      return;
    }
    if (activeGroupIndex > storyGroups.length - 1) {
      setActiveGroupIndex(0);
      setActiveStoryIndex(0);
      return;
    }
    const storyCount = storyGroups[activeGroupIndex]?.moments?.length || 0;
    if (activeStoryIndex > storyCount - 1) {
      setActiveStoryIndex(0);
    }
  }, [viewerOpen, storyGroups, activeGroupIndex, activeStoryIndex]);

  useEffect(() => {
    setViewerMenuOpen(false);
  }, [viewerOpen, activeGroupIndex, activeStoryIndex]);

  useEffect(() => {
    return () => {
      if (pendingPreviewUrl) {
        URL.revokeObjectURL(pendingPreviewUrl);
      }
    };
  }, [pendingPreviewUrl]);

  const createMoment = async (selectedFile, captionText = "") => {
    if (!selectedFile) return;
    try {
      setIsPosting(true);

      const pseudoPostId = `moment-${Date.now()}`;
      const urlRes = await api.post("/v1/uploads/url", { postId: pseudoPostId });
      const uploadUrl = resolveApiUrl(urlRes.data.uploadUrl);
      const fallbackReadUrl = resolveApiUrl(
        urlRes.data.fileUrl || urlRes.data.publicUrl || urlRes.data.url || ""
      );
      if (!uploadUrl) throw new Error("Upload URL is missing or invalid");

      const isPresignedUpload = /[?&]X-Amz-Algorithm=/i.test(uploadUrl);
      const uploadRequest = isPresignedUpload
        ? {
            method: "PUT",
            body: selectedFile,
            headers: {
              "Content-Type": selectedFile.type || "application/octet-stream",
            },
          }
        : (() => {
            const formData = new FormData();
            formData.append("file", selectedFile);
            return {
              method: "PUT",
              body: formData,
              headers: {
                Authorization: `Bearer ${localStorage.getItem("strobe_token")}`,
              },
            };
          })();

      const uploadRes = await fetch(uploadUrl, uploadRequest);

      if (!uploadRes.ok) {
        const uploadErrText = await uploadRes.text().catch(() => "");
        let uploadErr = null;
        try {
          uploadErr = uploadErrText ? JSON.parse(uploadErrText) : null;
        } catch {
          uploadErr = null;
        }
        throw new Error(uploadErr?.message || uploadErr?.error || uploadErrText || "Failed to upload image");
      }

      let uploadedPath = null;
      if (isPresignedUpload) {
        uploadedPath = fallbackReadUrl || uploadUrl.split("?")[0];
      } else {
        const uploadContentType = uploadRes.headers.get("content-type") || "";
        const uploaded = uploadContentType.includes("application/json")
          ? await uploadRes.json().catch(() => null)
          : null;
        uploadedPath = uploaded?.file?.url || uploaded?.url || null;
      }

      if (!uploadedPath) throw new Error("Upload did not return image URL");

      const finalImageUrl = resolveApiUrl(uploadedPath);
      if (!finalImageUrl) throw new Error("Uploaded image URL is invalid");

      await api.post("/v1/moments", {
        imageUrl: finalImageUrl,
        caption: captionText.trim(),
      });

      toast.success("Moment posted");
      setTab("feed");
      await loadMoments("feed");
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || "Failed to create moment");
    } finally {
      setIsPosting(false);
    }
  };

  const openStoryPicker = () => {
    if (isPosting) return;
    fileInputRef.current?.click();
  };

  const onStoryFilePicked = (e) => {
    const selectedFile = e.target.files?.[0] || null;
    if (!selectedFile) return;

    setPendingFile(selectedFile);
    setDraftCaption("");
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(selectedFile);
    });
    setComposerOpen(true);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const closeComposer = () => {
    if (isPosting) return;
    setComposerOpen(false);
    setPendingFile(null);
    setDraftCaption("");
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
  };

  const submitComposer = async () => {
    if (!pendingFile || isPosting) return;
    await createMoment(pendingFile, draftCaption);
    setComposerOpen(false);
    setPendingFile(null);
    setDraftCaption("");
    setPendingPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return "";
    });
  };

  const deleteMoment = async (momentId) => {
    try {
      await api.delete(`/v1/moments/${momentId}`);
      setMoments((prev) => prev.filter((m) => m.id !== momentId));
      toast.success("Moment deleted");
    } catch {
      toast.error("Failed to delete moment");
    }
  };

  const hideMoment = async (momentId) => {
    try {
      await api.post(`/v1/moments/${momentId}/hide`);
      setMoments((prev) => prev.filter((m) => m.id !== momentId));
      toast.success("Moment hidden");
    } catch {
      toast.error("Failed to hide moment");
    }
  };

  const openViewerAt = (index) => {
    setActiveGroupIndex(index);
    setActiveStoryIndex(0);
    setViewerOpen(true);
  };

  const closeViewer = () => setViewerOpen(false);

  const goPrev = () => {
    if (activeStoryIndex > 0) {
      setActiveStoryIndex((prev) => prev - 1);
      return;
    }

    if (activeGroupIndex > 0) {
      const prevGroupIndex = activeGroupIndex - 1;
      const prevCount = storyGroups[prevGroupIndex]?.moments?.length || 1;
      setActiveGroupIndex(prevGroupIndex);
      setActiveStoryIndex(prevCount - 1);
    }
  };

  const goNext = () => {
    if (activeStoryIndex < (activeGroup?.moments?.length || 0) - 1) {
      setActiveStoryIndex((prev) => prev + 1);
      return;
    }

    if (activeGroupIndex < storyGroups.length - 1) {
      setActiveGroupIndex((prev) => prev + 1);
      setActiveStoryIndex(0);
      return;
    }

    setViewerOpen(false);
  };

  const activeOwnerName = activeMoment
    ? usernamesById[activeMoment.userId] || `user-${activeMoment.userId?.slice(0, 6)}`
    : "";
  const activeCanDelete = activeMoment
    ? user?.role === "moderator" || activeMoment.userId === user?.id
    : false;
  const activeCanHide = activeMoment
    ? user?.role === "moderator" && tab === "feed"
    : false;
  return (
    <MomentsContainer>
      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.jpeg,.jpg,.webp,.gif"
        onChange={onStoryFilePicked}
        style={{ display: "none" }}
      />

      <div className="momentsHeader">
        <span className="momentsTitle">Moments</span>
        <button
          className="archiveToggle"
          type="button"
          onClick={() => setTab(tab === "feed" ? "archive" : "feed")}
        >
          {tab === "feed" ? "Archive" : "Back to moments"}
        </button>
      </div>

      {tab === "feed" ? (
        <div className="storiesRailWrap">
          {!loadingList && storyGroups.length === 0 && (
            <p className="empty">No moments yet. Add one to get started.</p>
          )}

          <div className="storiesRail" role="list">
            <button
              type="button"
              role="listitem"
              className="storyBubble addStoryBubble"
              onClick={openStoryPicker}
              disabled={isPosting}
            >
              <span className="storyAddCircle">+</span>
              <span className="storyName">{isPosting ? "Posting..." : "Add moment"}</span>
            </button>

            {storyGroups.map((group, index) => {
              const firstMoment = group.moments[0];
              const ownerName = usernamesById[group.userId] || `user-${group.userId?.slice(0, 6)}`;
              const isOwner = group.userId === user?.id;
              const count = group.moments.length;

              return (
                <button
                  type="button"
                  role="listitem"
                  key={group.userId}
                  className="storyBubble"
                  onClick={() => openViewerAt(index)}
                >
                  <span className="storyRing">
                    <img src={resolveImg(firstMoment.imageUrl)} alt={`${ownerName} moment`} className="storyThumb" />
                    {count > 1 && <span className="storyCount">+{count - 1}</span>}
                  </span>
                  <span className="storyName">{isOwner ? "Your moment" : `@${ownerName}`}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="archiveWrap">
          {!loadingList && sortedMoments.length === 0 && <p className="empty">No archived moments</p>}
          <div className="archiveGrid">
            {sortedMoments.map((moment) => {
              const canDelete = user?.role === "moderator" || moment.userId === user?.id;
              const ownerName = usernamesById[moment.userId] || `user-${moment.userId?.slice(0, 6)}`;

              return (
                <div key={moment.id} className="momentCard">
                  <img src={resolveImg(moment.imageUrl)} alt="Moment" className="momentImage" />
                  <div className="momentMeta">
                    <span className="owner">@{ownerName}</span>
                    {moment.caption && <span className="caption">{moment.caption}</span>}
                  </div>
                  <div className="actions">
                    {canDelete && (
                      <button type="button" onClick={() => deleteMoment(moment.id)}>
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {viewerOpen && activeMoment && (
        <div className="storyViewerBackdrop" onClick={closeViewer}>
          <div
            className="storyViewer"
            onClick={(e) => {
              setViewerMenuOpen(false);
              e.stopPropagation();
            }}
          >
            <div className="viewerTop">
              <div className="progressRow">
                {activeGroup.moments.map((moment, index) => (
                  <span key={moment.id} className="progressTrack">
                    <span
                      className={
                        index < activeStoryIndex
                          ? "progressFill done"
                          : index === activeStoryIndex
                            ? "progressFill active"
                            : "progressFill"
                      }
                    />
                  </span>
                ))}
              </div>

              <div className="viewerMeta">
                <span className="viewerOwner">
                  @{activeOwnerName}
                  {activeMoment.userId === user?.id ? " (you)" : ""}
                </span>
                <span className="viewerTime">
                  {activeMoment.createdAt ? new Date(activeMoment.createdAt).toLocaleString() : ""}
                </span>
                <div className="viewerMenuWrap">
                  <button
                    type="button"
                    className="viewerMenuTrigger"
                    onClick={(e) => {
                      e.stopPropagation();
                      setViewerMenuOpen((prev) => !prev);
                    }}
                    aria-label="Moment actions"
                  >
                    <FiMoreHorizontal />
                  </button>
                  {viewerMenuOpen && (
                    <div className="viewerMenu" onClick={(e) => e.stopPropagation()}>
                      {activeCanHide && (
                        <button
                          type="button"
                          className="viewerMenuItem"
                          onClick={() => {
                            hideMoment(activeMoment.id);
                            closeViewer();
                          }}
                        >
                          Hide
                        </button>
                      )}
                      {activeCanDelete && (
                        <button
                          type="button"
                          className="viewerMenuItem danger"
                          onClick={() => {
                            deleteMoment(activeMoment.id);
                            closeViewer();
                          }}
                        >
                          Delete
                        </button>
                      )}
                      <button
                        type="button"
                        className="viewerMenuItem"
                        onClick={closeViewer}
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
                </div>
            </div>

            <img src={resolveImg(activeMoment.imageUrl)} alt="Active moment" className="viewerImage" />

            {activeMoment.caption && <p className="viewerCaption">{activeMoment.caption}</p>}

            <button
              type="button"
              className="nav prev"
              onClick={goPrev}
              disabled={activeGroupIndex === 0 && activeStoryIndex === 0}
            >
              <MdChevronLeft />
            </button>
            <button type="button" className="nav next" onClick={goNext}>
              <MdChevronRight />
            </button>
          </div>
        </div>
      )}

      {composerOpen && (
        <div className="composerBackdrop" onClick={closeComposer}>
          <div className="composerModal" onClick={(e) => e.stopPropagation()}>
            <h3>Add moment</h3>
            <p className="composerHint">Share a moment with an optional caption.</p>

            {pendingPreviewUrl && (
              <img src={pendingPreviewUrl} alt="Moment preview" className="composerPreview" />
            )}

            <label htmlFor="storyCaption" className="composerLabel">
              Caption (optional)
            </label>
            <textarea
              id="storyCaption"
              className="composerInput"
              placeholder="Write something short..."
              maxLength={220}
              value={draftCaption}
              onChange={(e) => setDraftCaption(e.target.value)}
              disabled={isPosting}
            />

            <div className="composerActions">
              <button type="button" className="composerCancel" onClick={closeComposer} disabled={isPosting}>
                Cancel
              </button>
              <button type="button" className="composerPost" onClick={submitComposer} disabled={isPosting || !pendingFile}>
                {isPosting ? "Posting..." : "Post moment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </MomentsContainer>
  );
}

const MomentsContainer = styled.div`
  width: 100%;
  border: 1px solid #dbdbdb;
  border-radius: 12px;
  background: var(--surface);
  margin: 8px 0 14px;
  padding: 12px;
  box-shadow: none;

  .momentsHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .momentsTitle {
    font-size: 14px;
    font-weight: 700;
    color: #262626;
  }

  .archiveToggle {
    border: none;
    background: transparent;
    color: #0095f6;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    padding: 0;
  }

  .archiveToggle:hover {
    color: #0077c8;
  }

  .storiesRailWrap {
    border: 1px solid #efefef;
    border-radius: 12px;
    background: #fff;
    padding: 8px 6px;
  }

  .storiesRail {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    padding: 4px 4px 8px;
    scrollbar-width: thin;
  }

  .storyBubble {
    border: none;
    background: transparent;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    min-width: 76px;
    padding: 2px;
  }

  .addStoryBubble {
    border: 1px solid #dbdbdb;
    border-radius: 12px;
    min-height: 92px;
    justify-content: center;
    background: #fff;
    transition: background 0.2s ease;
  }

  .addStoryBubble:hover {
    background: #f7f7f7;
  }

  .addStoryBubble:disabled {
    opacity: 0.65;
    cursor: not-allowed;
  }

  .storyAddCircle {
    width: 42px;
    height: 42px;
    border-radius: 50%;
    border: 1px solid #dbdbdb;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    font-weight: 500;
    color: #262626;
    line-height: 1;
  }

  .storyRing {
    width: 68px;
    height: 68px;
    border-radius: 50%;
    background: linear-gradient(135deg, #feda75, #fa7e1e, #d62976, #962fbf, #4f5bd5);
    padding: 2px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .storyThumb {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    border: 2px solid #fff;
    display: block;
  }

  .storyName {
    width: 76px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    color: #444;
    text-align: center;
    line-height: 1.2;
  }

  .storyCount {
    position: absolute;
    right: -3px;
    top: -2px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 999px;
    background: #111;
    color: #fff;
    border: 2px solid #fff;
    font-size: 11px;
    font-weight: 700;
    line-height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .archiveWrap {
    margin-top: 10px;
    border: 1px solid #efefef;
    border-radius: 12px;
    background: #fff;
    padding: 10px;
  }

  .archiveGrid {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    max-height: 360px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .momentCard {
    border: 1px solid #efefef;
    border-radius: 10px;
    overflow: hidden;
    background: #fff;
    width: calc(50% - 5px);
  }

  .momentImage {
    width: 100%;
    height: 140px;
    object-fit: cover;
    display: block;
  }

  .momentMeta {
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .owner {
    font-size: 13px;
    color: #262626;
    font-weight: 700;
  }

  .time {
    font-size: 12px;
    color: #8e8e8e;
  }

  .caption {
    font-size: 12px;
    color: #262626;
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .actions {
    padding: 0 10px 10px;
    display: flex;
    gap: 8px;
  }

  .actions button {
    border: 1px solid #dbdbdb;
    border-radius: 10px;
    background: #fff;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .actions button:hover {
    background: #f7f7f7;
  }

  .storyViewerBackdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.82);
    z-index: 300;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .storyViewer {
    position: relative;
    width: min(420px, 100%);
    height: min(88vh, 760px);
    border-radius: 14px;
    overflow: hidden;
    background: #000;
    display: flex;
    flex-direction: column;
  }

  .viewerTop {
    position: absolute;
    left: 0;
    right: 0;
    top: 0;
    z-index: 2;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    background: linear-gradient(180deg, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0));
  }

  .progressRow {
    display: flex;
    gap: 4px;
  }

  .progressTrack {
    flex: 1;
    height: 3px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.35);
    overflow: hidden;
  }

  .progressFill {
    display: block;
    height: 100%;
    width: 0;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.95);
  }

  .progressFill.done {
    width: 100%;
  }

  .progressFill.active {
    animation: storyProgress 6.5s linear forwards;
  }

  @keyframes storyProgress {
    from {
      width: 0;
    }
    to {
      width: 100%;
    }
  }

  .progressTrack.done,
  .progressTrack.active {
    background: rgba(255, 255, 255, 0.95);
  }

  .viewerMeta {
    display: flex;
    gap: 10px;
    align-items: center;
    color: #fff;
    font-size: 13px;
    min-height: 30px;
  }

  .viewerOwner {
    font-weight: 700;
  }

  .viewerTime {
    opacity: 0.82;
    font-size: 12px;
  }

  .viewerImage {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .viewerCaption {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    margin: 0;
    padding: 14px 12px;
    color: #fff;
    font-size: 14px;
    background: linear-gradient(0deg, rgba(0, 0, 0, 0.66), rgba(0, 0, 0, 0));
  }

  .viewerMenuWrap {
    margin-left: auto;
    position: relative;
  }

  .viewerMenuTrigger {
    border: none;
    background: rgba(0, 0, 0, 0.42);
    color: #fff;
    border-radius: 999px;
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
    cursor: pointer;
  }

  .viewerMenuTrigger:hover {
    background: rgba(0, 0, 0, 0.55);
  }

  .viewerMenu {
    position: absolute;
    right: 0;
    top: 36px;
    min-width: 124px;
    background: rgba(30, 30, 30, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.35);
    backdrop-filter: blur(4px);
  }

  .viewerMenuItem {
    width: 100%;
    border: none;
    background: transparent;
    color: #f5f5f5;
    text-align: left;
    padding: 9px 12px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .viewerMenuItem:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .viewerMenuItem.danger {
    color: #ff8686;
  }

  .nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    width: 34px;
    height: 34px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.48);
    color: #fff;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    cursor: pointer;
  }

  .nav:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .nav.prev {
    left: 10px;
  }

  .nav.next {
    right: 10px;
  }

  .empty {
    text-align: center;
    color: #65676b;
    margin: 14px 4px;
    font-size: 14px;
  }

  .composerBackdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.54);
    z-index: 350;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 14px;
  }

  .composerModal {
    width: min(420px, 100%);
    border-radius: 14px;
    border: 1px solid #dbdbdb;
    background: #fff;
    padding: 14px;
  }

  .composerModal h3 {
    margin: 0;
    font-size: 18px;
    color: #262626;
  }

  .composerHint {
    margin: 4px 0 10px;
    color: #65676b;
    font-size: 13px;
  }

  .composerPreview {
    width: 100%;
    max-height: 330px;
    border-radius: 12px;
    object-fit: cover;
    border: 1px solid #efefef;
    margin-bottom: 10px;
  }

  .composerLabel {
    display: block;
    font-size: 13px;
    font-weight: 700;
    color: #262626;
    margin-bottom: 6px;
  }

  .composerInput {
    width: 100%;
    min-height: 92px;
    resize: vertical;
    border: 1px solid #dbdbdb;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 14px;
    font-family: inherit;
    outline: none;
  }

  .composerInput:focus {
    border-color: #a8a8a8;
  }

  .composerActions {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .composerCancel,
  .composerPost {
    border-radius: 10px;
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .composerCancel {
    border: 1px solid #dbdbdb;
    background: #fff;
    color: #262626;
  }

  .composerCancel:hover {
    background: #f7f7f7;
  }

  .composerPost {
    border: 1px solid #0095f6;
    background: #0095f6;
    color: #fff;
  }

  .composerPost:hover {
    background: #007ed6;
    border-color: #007ed6;
  }

  .composerPost:disabled,
  .composerCancel:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 700px) {
    .momentCard {
      width: 100%;
    }

    .storyViewerBackdrop {
      padding: 0;
    }

    .storyViewer {
      width: 100%;
      height: 100vh;
      border-radius: 0;
    }
  }
`;

export default Moments;

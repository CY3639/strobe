import { useEffect, useState, useRef } from "react";
import styled from "styled-components";
import { MdPermMedia } from "react-icons/md";
import { toast } from "sonner";
import api, { resolveApiUrl } from "../api";

const MAX_FILES = 5;

function Share(props) {
  const desc = useRef();
  const [files, setFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);
  const fileInput = useRef();

  useEffect(() => {
    return () => {
      previewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [previewUrls]);

  const onFileChange = (e) => {
    let selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    if (selectedFiles.length > MAX_FILES) {
      toast.warning(`You can upload up to ${MAX_FILES} images per post`);
      selectedFiles = selectedFiles.slice(0, MAX_FILES);
    }

    setFiles(selectedFiles);

    setPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return selectedFiles.map((selectedFile) => URL.createObjectURL(selectedFile));
    });
  };

  const submitHandler = async (e) => {
    e.preventDefault();
    if (files.length === 0) {
      toast.warning("Please select at least one photo");
      return;
    }

    if (files.length > MAX_FILES) {
      toast.warning(`Maximum ${MAX_FILES} images per post`);
      return;
    }

    let createdPostId = null;
    try {
      // 1. Create post with title
      const postRes = await api.post("/v1/posts", {
        title: desc.current.value,
        description: "",
        images: [],
      });
      
      const postId = postRes.data.post?.id || postRes.data.post?._id || postRes.data.id || postRes.data._id;
      createdPostId = postId;
      
      if (!postId) {
        toast.error("Failed to create post: no ID returned");
        return;
      }

      // 2. Upload each image sequentially and collect URLs
      const uploadedImageUrls = [];
      for (const selectedFile of files) {
        const urlRes = await api.post(`/v1/uploads/url`, { postId });
        const uploadUrl = resolveApiUrl(urlRes.data.uploadUrl);
        const fallbackReadUrl = resolveApiUrl(
          urlRes.data.fileUrl || urlRes.data.publicUrl || urlRes.data.url || ""
        );
        if (!uploadUrl) {
          throw new Error("Upload URL is missing or invalid");
        }

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
          // Presigned PUT uploads commonly return 200/204 with an empty body.
          uploadedPath = fallbackReadUrl || uploadUrl.split("?")[0];
        } else {
          const uploadContentType = uploadRes.headers.get("content-type") || "";
          const uploadedFile = uploadContentType.includes("application/json")
            ? await uploadRes.json().catch(() => null)
            : null;
          uploadedPath = uploadedFile?.file?.url || uploadedFile?.url || null;
        }

        if (!uploadedPath) {
          throw new Error("Upload did not return an image URL");
        }

        const imageUrl = resolveApiUrl(uploadedPath);
        if (!imageUrl) {
          throw new Error("Uploaded image URL is invalid");
        }

        uploadedImageUrls.push(imageUrl);
      }

      // 3. Update post with all image URLs
      await api.put(`/v1/posts/${postId}`, {
        images: uploadedImageUrls,
      });

      toast.success("Post created successfully!");
      desc.current.value = "";
      setFiles([]);
      setPreviewUrls((prev) => {
        prev.forEach((url) => URL.revokeObjectURL(url));
        return [];
      });
      if (fileInput.current) fileInput.current.value = "";
      props.onChange(1);
    } catch (err) {
      if (createdPostId) {
        // Remove partially-created posts that have no images after upload failure.
        await api.delete(`/v1/posts/${createdPostId}`).catch(() => {});
      }
      const errorMsg = err.response?.data?.message || err.message || "Failed to create post";
      toast.error(errorMsg);
    }
  };

  const clearAttachment = () => {
    setFiles([]);
    setPreviewUrls((prev) => {
      prev.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
    if (fileInput.current) fileInput.current.value = "";
  };

  return (
    <ShareContainer>
      <div className="shareWrapper">
        <div className="shareTop">
          <input
            placeholder="What's in your mind?"
            className="shareInput"
            ref={desc}
          />
        </div>
        <hr className="shareHr" />
        {files.length > 0 && (
          <div className="attachmentPreview">
            <div className="attachmentHeader">
              <span className="attachmentCount">
                {files.length} / {MAX_FILES} selected
              </span>
              <button type="button" className="removeAttachmentButton" onClick={clearAttachment}>
                Remove all
              </button>
            </div>

            <div className="attachmentGrid">
              {files.map((selectedFile, index) => (
                <div key={`${selectedFile.name}-${index}`} className="attachmentItem">
                  {previewUrls[index] && (
                    <img src={previewUrls[index]} alt="Selected attachment preview" className="attachmentImage" />
                  )}
                  <div className="attachmentMeta">
                    <span className="attachmentName">{selectedFile.name}</span>
                    <span className="attachmentSize">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        <form className="shareBottom" onSubmit={submitHandler}>
          <div className="shareOptions">
            <label htmlFor="file" className="shareOption">
              <MdPermMedia className="shareIcon" />
              <span className="shareOptionText">Photo or Video</span>
              <input
                ref={fileInput}
                style={{ display: "none" }}
                type="file"
                id="file"
                accept=".png,.jpeg,.jpg,.webp,.gif"
                multiple
                onChange={onFileChange}
              />
            </label>
          </div>
          <button className="shareButton" type="submit">
            Share
          </button>
        </form>
      </div>
    </ShareContainer>
  );
}

const ShareContainer = styled.div`
  width: 100%;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: var(--surface);
  box-shadow: var(--shadow-card);

  .shareWrapper {
    padding: 16px 16px 12px;
  }

  .shareTop {
    display: flex;
    align-items: center;
  }

  .shareInput {
    border: 1px solid transparent;
    border-radius: 12px;
    width: 100%;
    font-size: 15px;
    padding: 12px 14px;
    background: var(--surface-2);
  }

  .shareInput:focus {
    outline: none;
    border-color: #d9e7ff;
    box-shadow: 0 0 0 4px rgba(10, 132, 255, 0.12);
  }

  .shareHr {
    margin: 14px 0;
    border: none;
    border-top: 1px solid #eff3f8;
  }

  .shareBottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .attachmentPreview {
    border: 1px solid #e8edf6;
    border-radius: 12px;
    padding: 10px;
    margin: 0 0 13px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: #f8fbff;
  }

  .attachmentHeader {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
  }

  .attachmentCount {
    font-size: 13px;
    color: #4b5563;
    font-weight: 600;
  }

  .attachmentGrid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .attachmentItem {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
    background: #fff;
    border: 1px solid #e8edf6;
    border-radius: 10px;
    padding: 8px;
  }

  .attachmentImage {
    width: 52px;
    height: 52px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .attachmentMeta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }

  .attachmentName {
    font-size: 13px;
    font-weight: 600;
    color: #212529;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .attachmentSize {
    font-size: 12px;
    color: #65676b;
  }

  .removeAttachmentButton {
    border: 1px solid #dbdbdb;
    background: #fff;
    color: #262626;
    border-radius: 10px;
    padding: 8px 11px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
  }

  .removeAttachmentButton:hover {
    background: #f7f7f7;
  }

  .shareOptions {
    display: flex;
    margin-left: 0;
  }

  .shareOption {
    display: flex;
    align-items: center;
    margin-right: 15px;
    cursor: pointer;
    color: #5a6473;
    background: #edf0f4;
    border: 1px solid #dfe3e8;
    border-radius: 12px;
    padding: 9px 13px;
  }

  .shareIcon {
    font-size: 18px;
    margin-right: 3px;
  }

  .shareOptionText {
    font-size: 14px;
  }

  .shareButton {
    border: none;
    padding: 10px 18px;
    border-radius: 10px;
    background: #0095f6;
    color: white;
    font-size: 13px;
    font-weight: 700;
    margin-right: 0;
    cursor: pointer;
    transition: background 0.2s ease;
  }

  .shareButton:hover {
    background: #0084d6;
  }

  @media (max-width: 700px) {
    .shareWrapper {
      padding: 12px;
    }

    .shareOptionText {
      font-size: 13px;
    }

    .attachmentGrid {
      grid-template-columns: 1fr;
    }
  }
`;

export default Share;

import { useContext, useEffect, useRef, useState, useCallback } from "react";
import styled from "styled-components";
import Post from "./Post";
import Modal from "./UI/Modal";
import ShowPost from "./ShowPost";
import { SpinnerDotted } from "spinners-react";
import { AuthContext } from "../contexts/AuthContext/AuthContext";
import api from "../api";

function Feed(props) {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [selectedPostIndex, setSelectedPostIndex] = useState(null);
  const [offset, setOffset] = useState(0);
  const [exhausted, setExhausted] = useState(false);
  const listInnerRef = useRef();
  const LIMIT = 10;

  const fetchInitial = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get(`/v1/feed?limit=${LIMIT}&offset=0`);
      const newPosts = Array.isArray(res.data) ? res.data : (res.data?.posts || res.data?.data || res.data?.feed || []);

      setPosts(newPosts);
      setOffset(LIMIT);

      if (newPosts.length < LIMIT) {
        setExhausted(true);
      } else {
        setExhausted(false);
      }
    } catch {
      setPosts([]);
      setExhausted(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (props.rerenderFeed === 1) {
      setOffset(0);
      setPosts([]);
      setExhausted(false);
      fetchInitial();
      props.onChange(0);
    }
  }, [props.rerenderFeed, props, fetchInitial]);

  const fetchMore = useCallback(async (currentOffset) => {
    if (loading || exhausted) {
      return;
    }
    try {
      setLoading(true);
      const res = await api.get(`/v1/feed?limit=${LIMIT}&offset=${currentOffset}`);
      const newPosts = Array.isArray(res.data) ? res.data : (res.data?.posts || res.data?.data || res.data?.feed || []);

      if (newPosts.length < LIMIT) {
        setExhausted(true);
      }

      setPosts((prev) => [...prev, ...newPosts]);
      setOffset(currentOffset + LIMIT);
    } catch (err) {
      setExhausted(true);
    } finally {
      setLoading(false);
    }
  }, [loading, exhausted]);

  // Initial fetch when component mounts
  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  const onScroll = () => {
    if (!listInnerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listInnerRef.current;
    if (scrollTop + clientHeight >= scrollHeight - 100) {
      if (!loading && !exhausted) {
        fetchMore(offset);
      }
    }
  };

  return (
    <>
      {selectedPostIndex !== null && posts[selectedPostIndex] && (
        <Modal onClose={() => setSelectedPostIndex(null)} className="modal--post">
          <ShowPost
            post={posts[selectedPostIndex]}
            postList={posts}
            currentPostIndex={selectedPostIndex}
            onNavigatePost={(nextIndex) => setSelectedPostIndex(nextIndex)}
            onClose={() => setSelectedPostIndex(null)}
            onPostDeleted={(deletedId) => {
              setPosts((prev) => prev.filter((p) => p.id !== deletedId));
              setSelectedPostIndex(null);
              props.onChange(1);
            }}
            onNewComment={() => {
              setPosts((prev) =>
                prev.map((p, idx) =>
                  idx === selectedPostIndex
                    ? {
                        ...p,
                        stats: {
                          ...(p.stats || {}),
                          comments: (p.stats?.comments || 0) + 1,
                        },
                      }
                    : p
                )
              );
            }}
          />
        </Modal>
      )}

      <FeedContainer>
        <div onScroll={onScroll} ref={listInnerRef} className="FeedWrapper">
          {posts.length === 0 && loading && (
            <center>
              <SpinnerDotted color="rgb(0,149,246)" />
            </center>
          )}
          
          {posts.map((p) => (
            <Post
              key={p.id}
              post={p}
              rerenderFeed={props.rerenderFeed}
              onChange={props.onChange}
              onOpenPost={() => setSelectedPostIndex(posts.findIndex((x) => x.id === p.id))}
            />
          ))}
          
          {!loading && posts.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 20px", color: "#65676b" }}>
              <div style={{ fontSize: "16px", marginBottom: "10px" }}>No posts yet</div>
              <div style={{ fontSize: "14px" }}>Start following people to see their posts!</div>
            </div>
          )}
          
          {exhausted && posts.length > 0 && (
            <div style={{ textAlign: "center", padding: "20px", color: "#65676b" }}>
              No more posts
            </div>
          )}
        </div>
      </FeedContainer>
    </>
  );
}

const FeedContainer = styled.div`
  width: 100%;
  max-width: 640px;

  .FeedWrapper {
    height: calc(100vh - 84px);
    overflow-y: auto;
    padding: 2px 2px 20px;
    scrollbar-width: thin;
    scrollbar-color: #cfd8ea transparent;

    ::-webkit-scrollbar {
      width: 6px;
    }

    ::-webkit-scrollbar-track {
      background-color: transparent;
    }

    ::-webkit-scrollbar-thumb {
      background-color: #cfd8ea;
      border-radius: 99px;
    }
  }
`;

export default Feed;

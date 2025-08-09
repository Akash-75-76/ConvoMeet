import React, { useEffect, useRef, useState, useCallback } from "react";
import io from "socket.io-client";
import {
  Badge,
  IconButton,
  TextField,
  CircularProgress,
  Snackbar,
  Alert,
} from "@mui/material";
import { Button } from "@mui/material";
import VideocamIcon from "@mui/icons-material/Videocam";
import VideocamOffIcon from "@mui/icons-material/VideocamOff";
import styles from '/src/styles/vedioComponent.module.css';
import CallEndIcon from "@mui/icons-material/CallEnd";
import MicIcon from "@mui/icons-material/Mic";
import MicOffIcon from "@mui/icons-material/MicOff";
import ScreenShareIcon from "@mui/icons-material/ScreenShare";
import StopScreenShareIcon from "@mui/icons-material/StopScreenShare";
import ChatIcon from "@mui/icons-material/Chat";
import server from '../envirment';

const server_url =server;


const peerConfigConnections = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

const VideoMeetComponent = () => {
  // Refs
  const socketRef = useRef(null);
  const socketIdRef = useRef(null);
  const localVideoref = useRef(null);
  const connectionsRef = useRef({});
  const videoRefs = useRef({});

  // State
  const [mediaState, setMediaState] = useState({
    videoAvailable: false,
    audioAvailable: false,
    screenAvailable: false,
    videoEnabled: false,
    audioEnabled: false,
    screenEnabled: false,
    loading: true,
    error: null,
  });

  const [uiState, setUiState] = useState({
    showChat: false,
    newMessages: 0,
    askForUsername: true,
    username: "",
  });

  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  const [remoteStreams, setRemoteStreams] = useState([]);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: "",
    severity: "info",
  });

  // Media stream utilities
  const silence = useCallback(() => {
    const ctx = new AudioContext();
    const oscillator = ctx.createOscillator();
    const dst = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  }, []);

  const black = useCallback(({ width = 640, height = 480 } = {}) => {
    const canvas = Object.assign(document.createElement("canvas"), {
      width,
      height,
    });
    canvas.getContext("2d").fillRect(0, 0, width, height);
    const stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  }, []);

  const getBlackSilenceStream = useCallback(() => {
    return new MediaStream([black(), silence()]);
  }, [black, silence]);

  // Cleanup functions
  const cleanupMediaStream = useCallback((stream) => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const cleanupConnections = useCallback(() => {
    Object.values(connectionsRef.current).forEach((pc) => {
      if (pc) {
        pc.close();
      }
    });
    connectionsRef.current = {};
  }, []);

  // Media handling
  const getUserMediaSuccess = useCallback(
    (stream) => {
      try {
        if (localVideoref.current?.srcObject) {
          cleanupMediaStream(localVideoref.current.srcObject);
        }

        localVideoref.current.srcObject = stream;
        window.localStream = stream;

        // Update all existing connections with the new stream
        Object.entries(connectionsRef.current).forEach(([id, pc]) => {
          if (id === socketIdRef.current) return;

          try {
            pc.getSenders().forEach((sender) => pc.removeTrack(sender));
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));

            pc.createOffer()
              .then((description) => {
                pc.setLocalDescription(description)
                  .then(() => {
                    socketRef.current?.emit(
                      "signal",
                      id,
                      JSON.stringify({ sdp: pc.localDescription })
                    );
                  })
                  .catch((error) => {
                    console.error("Error setting local description:", error);
                    setSnackbar({
                      open: true,
                      message: "Error updating stream",
                      severity: "error",
                    });
                  });
              })
              .catch((error) => {
                console.error("Error creating offer:", error);
                setSnackbar({
                  open: true,
                  message: "Error creating offer",
                  severity: "error",
                });
              });
          } catch (error) {
            console.error("Error updating peer connection:", error);
          }
        });

        // Handle track ended events
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            setMediaState((prev) => ({
              ...prev,
              videoEnabled: false,
              audioEnabled: false,
            }));
            handleMediaChange(false, false);
          };
        });
      } catch (error) {
        console.error("Error handling user media:", error);
        setSnackbar({
          open: true,
          message: "Error accessing media devices",
          severity: "error",
        });
      }
    },
    [cleanupMediaStream]
  );

  const getDisplayMediaSuccess = useCallback(
    (stream) => {
      try {
        if (localVideoref.current?.srcObject) {
          cleanupMediaStream(localVideoref.current.srcObject);
        }

        localVideoref.current.srcObject = stream;
        window.localStream = stream;

        // Update all existing connections with the new stream
        Object.entries(connectionsRef.current).forEach(([id, pc]) => {
          if (id === socketIdRef.current) return;

          try {
            pc.getSenders().forEach((sender) => pc.removeTrack(sender));
            stream.getTracks().forEach((track) => pc.addTrack(track, stream));

            pc.createOffer()
              .then((description) => {
                pc.setLocalDescription(description)
                  .then(() => {
                    socketRef.current?.emit(
                      "signal",
                      id,
                      JSON.stringify({ sdp: pc.localDescription })
                    );
                  })
                  .catch((error) => {
                    console.error("Error setting local description:", error);
                    setSnackbar({
                      open: true,
                      message: "Error updating screen share",
                      severity: "error",
                    });
                  });
              })
              .catch((error) => {
                console.error("Error creating offer:", error);
                setSnackbar({
                  open: true,
                  message: "Error creating screen share offer",
                  severity: "error",
                });
              });
          } catch (error) {
            console.error("Error updating peer connection:", error);
          }
        });

        // Handle track ended events
        stream.getTracks().forEach((track) => {
          track.onended = () => {
            setMediaState((prev) => ({
              ...prev,
              screenEnabled: false,
            }));
            handleScreenShare(false);
          };
        });
      } catch (error) {
        console.error("Error handling display media:", error);
        setSnackbar({
          open: true,
          message: "Error sharing screen",
          severity: "error",
        });
      }
    },
    [cleanupMediaStream]
  );

  const handleMediaChange = useCallback(
    async (videoEnabled, audioEnabled) => {
      try {
        if (videoEnabled || audioEnabled) {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: videoEnabled && mediaState.videoAvailable,
            audio: audioEnabled && mediaState.audioAvailable,
          });
          getUserMediaSuccess(stream);
        } else {
          const blackSilenceStream = getBlackSilenceStream();
          localVideoref.current.srcObject = blackSilenceStream;
          window.localStream = blackSilenceStream;

          // Update all connections with the black silence stream
          Object.entries(connectionsRef.current).forEach(([id, pc]) => {
            if (id === socketIdRef.current) return;

            try {
              pc.getSenders().forEach((sender) => pc.removeTrack(sender));
              blackSilenceStream
                .getTracks()
                .forEach((track) => pc.addTrack(track, blackSilenceStream));

              pc.createOffer()
                .then((description) => {
                  pc.setLocalDescription(description)
                    .then(() => {
                      socketRef.current?.emit(
                        "signal",
                        id,
                        JSON.stringify({ sdp: pc.localDescription })
                      );
                    })
                    .catch((error) => {
                      console.error("Error setting local description:", error);
                      setSnackbar({
                        open: true,
                        message: "Error updating stream",
                        severity: "error",
                      });
                    });
                })
                .catch((error) => {
                  console.error("Error creating offer:", error);
                  setSnackbar({
                    open: true,
                    message: "Error creating offer",
                    severity: "error",
                  });
                });
            } catch (error) {
              console.error("Error updating peer connection:", error);
            }
          });
        }
      } catch (error) {
        console.error("Error changing media state:", error);
        setSnackbar({
          open: true,
          message: `Error ${videoEnabled ? "enabling" : "disabling"} ${
            audioEnabled ? "audio/video" : "video"
          }`,
          severity: "error",
        });
      }
    },
    [
      getUserMediaSuccess,
      getBlackSilenceStream,
      mediaState.videoAvailable,
      mediaState.audioAvailable,
    ]
  );

  const handleScreenShare = useCallback(
    async (screenEnabled) => {
      try {
        if (screenEnabled) {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: true,
          });
          getDisplayMediaSuccess(stream);
        } else {
          // Return to previous media state
          handleMediaChange(mediaState.videoEnabled, mediaState.audioEnabled);
        }
      } catch (error) {
        console.error("Error handling screen share:", error);
        if (error.name !== "NotAllowedError") {
          setSnackbar({
            open: true,
            message: "Error sharing screen",
            severity: "error",
          });
        }
        setMediaState((prev) => ({ ...prev, screenEnabled: false }));
      }
    },
    [
      getDisplayMediaSuccess,
      handleMediaChange,
      mediaState.videoEnabled,
      mediaState.audioEnabled,
    ]
  );

  // Socket and WebRTC handling
  const handleSignal = useCallback((fromId, message) => {
    try {
      const signal = JSON.parse(message);

      if (fromId !== socketIdRef.current) {
        const pc = connectionsRef.current[fromId];
        if (!pc) return;

        if (signal.sdp) {
          pc.setRemoteDescription(new RTCSessionDescription(signal.sdp))
            .then(() => {
              if (signal.sdp.type === "offer") {
                pc.createAnswer()
                  .then((description) => {
                    pc.setLocalDescription(description)
                      .then(() => {
                        socketRef.current?.emit(
                          "signal",
                          fromId,
                          JSON.stringify({ sdp: pc.localDescription })
                        );
                      })
                      .catch((error) => {
                        console.error(
                          "Error setting local description:",
                          error
                        );
                      });
                  })
                  .catch((error) => {
                    console.error("Error creating answer:", error);
                  });
              }
            })
            .catch((error) => {
              console.error("Error setting remote description:", error);
            });
        }

        if (signal.ice) {
          pc.addIceCandidate(new RTCIceCandidate(signal.ice)).catch((error) => {
            console.error("Error adding ICE candidate:", error);
          });
        }
      }
    } catch (error) {
      console.error("Error handling signal:", error);
    }
  }, []);

  const handleUserJoined = useCallback(
    (id, clients) => {
      clients.forEach((socketListId) => {
        if (connectionsRef.current[socketListId]) return;

        const pc = new RTCPeerConnection(peerConfigConnections);
        connectionsRef.current[socketListId] = pc;

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socketRef.current?.emit(
              "signal",
              socketListId,
              JSON.stringify({ ice: event.candidate })
            );
          }
        };

        pc.ontrack = (event) => {
          setRemoteStreams((prev) => {
            const existing = prev.find(
              (stream) => stream.socketId === socketListId
            );
            if (existing) {
              return prev.map((stream) =>
                stream.socketId === socketListId
                  ? { ...stream, stream: event.streams[0] }
                  : stream
              );
            }
            return [
              ...prev,
              { socketId: socketListId, stream: event.streams[0] },
            ];
          });
        };

        // Add the local video stream
        if (window.localStream) {
          window.localStream.getTracks().forEach((track) => {
            pc.addTrack(track, window.localStream);
          });
        } else {
          const blackSilenceStream = getBlackSilenceStream();
          blackSilenceStream.getTracks().forEach((track) => {
            pc.addTrack(track, blackSilenceStream);
          });
        }
      });

      if (id === socketIdRef.current) {
        Object.entries(connectionsRef.current).forEach(([id2, pc]) => {
          if (id2 === socketIdRef.current) return;

          pc.createOffer()
            .then((description) => {
              pc.setLocalDescription(description)
                .then(() => {
                  socketRef.current?.emit(
                    "signal",
                    id2,
                    JSON.stringify({ sdp: pc.localDescription })
                  );
                })
                .catch((error) => {
                  console.error("Error setting local description:", error);
                });
            })
            .catch((error) => {
              console.error("Error creating offer:", error);
            });
        });
      }
    },
    [getBlackSilenceStream]
  );

  const handleUserLeft = useCallback((id) => {
    if (connectionsRef.current[id]) {
      connectionsRef.current[id].close();
      delete connectionsRef.current[id];
    }

    setRemoteStreams((prev) => prev.filter((stream) => stream.socketId !== id));
  }, []);

  const addChatMessage = useCallback((data, sender, socketIdSender) => {
    setMessages((prev) => [...prev, { sender, data }]);
    if (socketIdSender !== socketIdRef.current) {
      setUiState((prev) => ({ ...prev, newMessages: prev.newMessages + 1 }));
    }
  }, []);

  // Initialization and cleanup
  useEffect(() => {
    const checkPermissions = async () => {
      try {
        setMediaState((prev) => ({ ...prev, loading: true }));

        const [videoPermission, audioPermission] = await Promise.all([
          navigator.mediaDevices
            .getUserMedia({ video: true })
            .then(() => true)
            .catch(() => false),
          navigator.mediaDevices
            .getUserMedia({ audio: true })
            .then(() => true)
            .catch(() => false),
        ]);

        const screenAvailable = !!navigator.mediaDevices.getDisplayMedia;

        setMediaState({
          videoAvailable: videoPermission,
          audioAvailable: audioPermission,
          screenAvailable,
          videoEnabled: false,
          audioEnabled: false,
          screenEnabled: false,
          loading: false,
          error: null,
        });
      } catch (error) {
        console.error("Error checking permissions:", error);
        setMediaState((prev) => ({
          ...prev,
          loading: false,
          error: "Could not access media devices",
        }));
        setSnackbar({
          open: true,
          message: "Error accessing media devices",
          severity: "error",
        });
      }
    };

    checkPermissions();

    return () => {
      cleanupConnections();
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      cleanupMediaStream(localVideoref.current?.srcObject);
    };
  }, [cleanupConnections, cleanupMediaStream]);

  const connectToSocketServer = useCallback(() => {
    try {
      socketRef.current = io.connect(server_url, { secure: false });

      socketRef.current.on("signal", handleSignal);
      socketRef.current.on("user-joined", handleUserJoined);
      socketRef.current.on("user-left", handleUserLeft);
      socketRef.current.on("chat-message", addChatMessage);

      socketRef.current.on("connect", () => {
        socketRef.current.emit("join-call", window.location.href);
        socketIdRef.current = socketRef.current.id;
      });

      socketRef.current.on("connect_error", (error) => {
        console.error("Connection error:", error);
        setSnackbar({
          open: true,
          message: "Connection error",
          severity: "error",
        });
      });
    } catch (error) {
      console.error("Error connecting to socket server:", error);
      setSnackbar({
        open: true,
        message: "Error connecting to server",
        severity: "error",
      });
    }
  }, [handleSignal, handleUserJoined, handleUserLeft, addChatMessage]);

  const startCall = useCallback(() => {
    if (!uiState.username.trim()) {
      setSnackbar({
        open: true,
        message: "Please enter a username",
        severity: "warning",
      });
      return;
    }

    setUiState((prev) => ({ ...prev, askForUsername: false }));
    connectToSocketServer();
    handleMediaChange(mediaState.videoAvailable, mediaState.audioAvailable);
  }, [
    uiState.username,
    connectToSocketServer,
    handleMediaChange,
    mediaState.videoAvailable,
    mediaState.audioAvailable,
  ]);

  const endCall = useCallback(() => {
    cleanupConnections();
    cleanupMediaStream(localVideoref.current?.srcObject);
    if (socketRef.current) {
      socketRef.current.disconnect();
    }
    window.location.href = "/";
  }, [cleanupConnections, cleanupMediaStream]);

  const sendMessage = useCallback(() => {
    if (!messageInput.trim()) return;

    socketRef.current?.emit("chat-message", messageInput, uiState.username);
    setMessageInput("");
  }, [messageInput, uiState.username]);

  // UI handlers
  const toggleVideo = useCallback(() => {
    const newVideoState = !mediaState.videoEnabled;
    setMediaState((prev) => ({ ...prev, videoEnabled: newVideoState }));
    handleMediaChange(newVideoState, mediaState.audioEnabled);
  }, [mediaState.videoEnabled, mediaState.audioEnabled, handleMediaChange]);

  const toggleAudio = useCallback(() => {
    const newAudioState = !mediaState.audioEnabled;
    setMediaState((prev) => ({ ...prev, audioEnabled: newAudioState }));
    handleMediaChange(mediaState.videoEnabled, newAudioState);
  }, [mediaState.audioEnabled, mediaState.videoEnabled, handleMediaChange]);

  const toggleScreenShare = useCallback(() => {
    const newScreenState = !mediaState.screenEnabled;
    setMediaState((prev) => ({ ...prev, screenEnabled: newScreenState }));
    handleScreenShare(newScreenState);
  }, [mediaState.screenEnabled, handleScreenShare]);

  const toggleChat = useCallback(() => {
    setUiState((prev) => ({
      ...prev,
      showChat: !prev.showChat,
      newMessages: prev.showChat ? prev.newMessages : 0,
    }));
  }, []);

  if (mediaState.loading) {
    return (
      <div className={styles.loadingContainer}>
        <CircularProgress />
        <p>Checking media permissions...</p>
      </div>
    );
  }

  if (mediaState.error) {
    return (
      <div className={styles.errorContainer}>
        <Alert severity="error">{mediaState.error}</Alert>

        <Button variant="contained" onClick={() => window.location.reload()}>
          Retry
        </Button>
      </div>
    );
  }

  if (uiState.askForUsername) {
    return (
      <div className={styles.lobbyContainer}>
        <h2>Enter into Lobby</h2>
        <TextField
          id="username-input"
          label="Username"
          value={uiState.username}
          onChange={(e) =>
            setUiState((prev) => ({ ...prev, username: e.target.value }))
          }
          variant="outlined"
          fullWidth
          margin="normal"
        />
        <Button
          variant="contained"
          onClick={startCall}
          disabled={!uiState.username.trim()}
        >
          Connect
        </Button>

        <div className={styles.previewContainer}>
          <video
            ref={localVideoref}
            autoPlay
            muted
            playsInline
            className={styles.previewVideo}
          ></video>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.meetContainer}>
      {/* Snackbar for notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
      >
        <Alert
          onClose={() => setSnackbar((prev) => ({ ...prev, open: false }))}
          severity={snackbar.severity}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>

      {/* Chat modal */}
      {uiState.showChat && (
        <div className={styles.chatModal}>
          <div className={styles.chatHeader}>
            <h3>Chat</h3>
            <Button onClick={toggleChat}>Close</Button>
          </div>

          <div className={styles.chatMessages}>
            {messages.length > 0 ? (
              messages.map((msg, index) => (
                <div key={index} className={styles.message}>
                  <strong>{msg.sender}: </strong>
                  <span>{msg.data}</span>
                </div>
              ))
            ) : (
              <p className={styles.noMessages}>No messages yet</p>
            )}
          </div>

          <div className={styles.chatInput}>
            <TextField
              fullWidth
              value={messageInput}
              onChange={(e) => setMessageInput(e.target.value)}
              placeholder="Type a message..."
              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
            />
            <Button
              variant="contained"
              onClick={sendMessage}
              disabled={!messageInput.trim()}
            >
              Send
            </Button>
          </div>
        </div>
      )}

      {/* Video containers */}
      <div className={styles.videoGrid}>
        {/* Local video */}
        <div className={styles.videoContainer}>
          <video
            ref={localVideoref}
            autoPlay
            muted
            playsInline
            className={styles.videoElement}
          />
          <div className={styles.videoLabel}>
            You ({uiState.username})
            {!mediaState.videoEnabled && <span> (Camera off)</span>}
          </div>
        </div>

        {/* Remote videos */}
        {remoteStreams.map(({ socketId, stream }) => (
          <div key={socketId} className={styles.videoContainer}>
            <video
              ref={(el) => {
                if (el && stream) {
                  el.srcObject = stream;
                }
                videoRefs.current[socketId] = el;
              }}
              autoPlay
              playsInline
              className={styles.videoElement}
            />
            <div className={styles.videoLabel}>
              Participant {socketId.substring(0, 6)}
            </div>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <IconButton
          onClick={toggleVideo}
          color={mediaState.videoEnabled ? "primary" : "default"}
          aria-label={
            mediaState.videoEnabled ? "Turn off camera" : "Turn on camera"
          }
        >
          {mediaState.videoEnabled ? <VideocamIcon /> : <VideocamOffIcon />}
        </IconButton>

        <IconButton
          onClick={toggleAudio}
          color={mediaState.audioEnabled ? "primary" : "default"}
          aria-label={
            mediaState.audioEnabled ? "Mute microphone" : "Unmute microphone"
          }
        >
          {mediaState.audioEnabled ? <MicIcon /> : <MicOffIcon />}
        </IconButton>

        {mediaState.screenAvailable && (
          <IconButton
            onClick={toggleScreenShare}
            color={mediaState.screenEnabled ? "primary" : "default"}
            aria-label={
              mediaState.screenEnabled ? "Stop screen share" : "Share screen"
            }
          >
            {mediaState.screenEnabled ? (
              <StopScreenShareIcon />
            ) : (
              <ScreenShareIcon />
            )}
          </IconButton>
        )}

        <IconButton
          onClick={toggleChat}
          color={uiState.showChat ? "primary" : "default"}
          aria-label="Toggle chat"
        >
          <Badge badgeContent={uiState.newMessages} color="error">
            <ChatIcon />
          </Badge>
        </IconButton>

        <IconButton
          onClick={endCall}
          style={{ color: "red" }}
          aria-label="End call"
        >
          <CallEndIcon />
        </IconButton>
      </div>
    </div>
  );
};

export default VideoMeetComponent;

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { getWebContainer } from "@/shared/webcontainer";
import {
  visualEditorIncomingMessageSchema,
  type VisualEditorElementInfo,
} from "@/shared/schemas";
import editScriptSource from "./visual-edit-script.js?raw";

const IFRAME_LOAD_DELAY_MS = 300;
let previewScriptPromise: Promise<void> | undefined;

const ensurePreviewScript = (): Promise<void> => {
  previewScriptPromise ??= getWebContainer()
    .then((container) => container.setPreviewScript(editScriptSource))
    .catch((error: unknown) => {
      previewScriptPromise = undefined;
      throw error;
    });
  return previewScriptPromise;
};

const getOrigin = (url: string | undefined): string | undefined => {
  if (url === undefined) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
};

export type VisualEditorState = {
  readonly iframeRef: RefObject<HTMLIFrameElement | null>;
  readonly editMode: boolean;
  readonly selectedElement: VisualEditorElementInfo | undefined;
  readonly toggleEditMode: () => void;
  readonly exitEditMode: () => void;
  readonly clearSelection: () => void;
  readonly handleIframeLoad: () => void;
};

export function useVisualEditor(previewUrl?: string): VisualEditorState {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [editMode, setEditMode] = useState(false);
  const [selectedElement, setSelectedElement] =
    useState<VisualEditorElementInfo>();
  const editModeRef = useRef(false);
  const previewOrigin = getOrigin(previewUrl);

  const postToIframe = useCallback(
    (message: object): void => {
      iframeRef.current?.contentWindow?.postMessage(
        message,
        previewOrigin ?? "*",
      );
    },
    [previewOrigin],
  );

  const clearSelection = useCallback(() => {
    setSelectedElement(undefined);
    postToIframe({ type: "CLEAR_SELECTION" });
  }, [postToIframe]);

  const exitEditMode = useCallback(() => {
    editModeRef.current = false;
    setEditMode(false);
    setSelectedElement(undefined);
    postToIframe({ type: "TOGGLE_EDIT_MODE", editMode: false });
    postToIframe({ type: "CLEAR_ALL_EFFECTS" });
  }, [postToIframe]);

  const toggleEditMode = useCallback(() => {
    setEditMode((current) => {
      const next = !current;
      editModeRef.current = next;
      if (next) {
        postToIframe({ type: "TOGGLE_EDIT_MODE", editMode: true });
      } else {
        setSelectedElement(undefined);
        postToIframe({ type: "TOGGLE_EDIT_MODE", editMode: false });
        postToIframe({ type: "CLEAR_ALL_EFFECTS" });
      }
      return next;
    });
  }, [postToIframe]);

  const handleIframeLoad = useCallback(() => {
    setTimeout(() => {
      if (editModeRef.current) {
        postToIframe({ type: "TOGGLE_EDIT_MODE", editMode: true });
      } else {
        postToIframe({ type: "CLEAR_ALL_EFFECTS" });
      }
    }, IFRAME_LOAD_DELAY_MS);
  }, [postToIframe]);

  useEffect(() => {
    void ensurePreviewScript().catch(() => undefined);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<unknown>): void => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (previewOrigin !== undefined && event.origin !== previewOrigin) return;
      const result = visualEditorIncomingMessageSchema.safeParse(event.data);
      if (!result.success) return;
      if (result.data.type === "ELEMENT_SELECTED") {
        setSelectedElement(result.data.elementInfo);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [previewOrigin]);

  return {
    iframeRef,
    editMode,
    selectedElement,
    toggleEditMode,
    exitEditMode,
    clearSelection,
    handleIframeLoad,
  };
}

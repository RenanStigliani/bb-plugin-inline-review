import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { takeSelectionAction } from "./lib/actions";
import { ActionSettings } from "./components/ActionSettings";
import { ReviewBanner } from "./components/ReviewBanner";
import { ReviewOverlay } from "./components/ReviewOverlay";
import { reviewEditorStore } from "./lib/editor-store";
import { reviewHighlights } from "./lib/review-highlights";
export default definePluginApp((app) => {
  app.slots.settingsSection({ id: "selection-actions", title: "Selection actions", component: ActionSettings });
  app.contentScripts.register({
    id: "review-highlights",
    mount({ generation }) {
      return reviewHighlights.mount(generation);
    },
  });
  app.slots.experimental_appOverlay({
    id: "feedback-editor",
    component: ReviewOverlay,
  });
  app.composer.customize({
    id: "thread-feedback",
    scopes: ["thread"],
    banners: [{ id: "draft", chrome: "bare", component: ReviewBanner }],
  });
  app.slots.messageAction({
    id: "add-feedback",
    title: "Feedback",
    icon: "MessageSquare",
    run({ threadId, message, selectedText }) {
      const action = takeSelectionAction();
      if (
        message.role !== "assistant" ||
        message.threadId !== threadId ||
        !selectedText?.trim()
      ) {
        toast.info("Select text in an assistant message to add feedback.");
        return;
      }
      if (selectedText.length > 20000) {
        toast.error("Select at most 20,000 characters.");
        return;
      }
      const invocationId = crypto.randomUUID();
      reviewHighlights.captureSelection(invocationId, threadId, selectedText);
      reviewEditorStore.open({
        mode: "create",
        action,
        selection: {
          invocationId,
          message: {
            id: message.id,
            threadId,
            role: "assistant",
            sourceSeqEnd: message.sourceSeqEnd,
          },
          selectedText,
        },
      });
    },
  });
});

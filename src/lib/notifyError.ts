/**
 * 用户可见错误的收口：先入会话日志，再 toast / alert。
 * 金路径失败必须走这里，避免只闪一下界面。
 */
import { toast } from "sonner";
import { appLog } from "./appLog";

function userMessageOf(message: unknown) {
	if (typeof message === "string") {
		return message;
	}
	if (message instanceof Error) {
		return message.message;
	}
	return String(message);
}

export function notifyError(
	message: unknown,
	options?: Parameters<typeof toast.error>[1] & { scope?: string; event?: string; data?: unknown },
) {
	const userMessage = userMessageOf(message);
	appLog({
		level: "error",
		scope: options?.scope ?? "ui",
		event: options?.event ?? "ui.toast",
		msg: userMessage,
		data: {
			userMessage,
			...(options?.data && typeof options.data === "object" ? options.data : {}),
		},
	});
	const { scope: _scope, event: _event, data: _data, ...toastOptions } = options ?? {};
	return toast.error(userMessage, toastOptions);
}

export function notifyWarn(
	message: unknown,
	options?: Parameters<typeof toast.warning>[1] & { scope?: string; event?: string; data?: unknown },
) {
	const userMessage = userMessageOf(message);
	appLog({
		level: "warn",
		scope: options?.scope ?? "ui",
		event: options?.event ?? "ui.toast",
		msg: userMessage,
		data: {
			userMessage,
			...(options?.data && typeof options.data === "object" ? options.data : {}),
		},
	});
	const { scope: _scope, event: _event, data: _data, ...toastOptions } = options ?? {};
	return toast.warning(userMessage, toastOptions);
}

/** 系统 alert 之前先入档，文案与弹框一致。 */
export function notifyAlert(
	message: string,
	options?: { scope?: string; event?: string; data?: unknown },
) {
	appLog({
		level: "error",
		scope: options?.scope ?? "ui",
		event: options?.event ?? "ui.alert",
		msg: message,
		data: {
			userMessage: message,
			...(options?.data && typeof options.data === "object" ? options.data : {}),
		},
	});
	alert(message);
}

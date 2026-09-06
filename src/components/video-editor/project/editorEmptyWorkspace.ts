/**
 * 从录制条打开编辑器时的装载规则：
 * 有当前课就开课；什么都没有就进空项目，而不是整页报错。
 * 对齐剪映草稿箱 / Premiere 项目管理器：空工作区是合法状态。
 */
export function shouldLoadEmptyEditorWorkspace(input: {
	/** 当前项目文件已成功装上 */
	hasLoadedProject: boolean;
	/** 当前录制会话里有成片路径 */
	hasSessionVideo: boolean;
	/** 主进程还记着一条当前视频路径 */
	hasCurrentVideo: boolean;
}): boolean {
	return !input.hasLoadedProject && !input.hasSessionVideo && !input.hasCurrentVideo;
}

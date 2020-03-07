import * as vscode from 'vscode';
import * as vsls from 'vsls/vscode';

type RolesDictionary = { [peerNumber: number]: string };
interface UpdateRolesEventArgs {
	roles: RolesDictionary;
}

let liveshare: vsls.LiveShare;

let updateRolesTimeout: NodeJS.Timeout;
const disposables: vscode.Disposable[] = [];

const participants: number[] = [];

const SERVICE_NAME = 'pairit';
const NOTIFICATION_NAME = 'updateRoles';

const ROLE_DRIVER = 'Driver';
const ROLE_NAVIGATOR = 'Navigator';
const ROLE_MOB = 'Mob';

let statusBarItem: vscode.StatusBarItem;

let myRole: string;
function setRole(role: string) {
	if (role !== myRole) {
		vscode.window.showInformationMessage(`New Role: ${role}`);
		myRole = role;
		statusBarItem.text = role;
	}
}

export function activate(context: vscode.ExtensionContext) {
	statusBarItem = vscode.window.createStatusBarItem();
	statusBarItem.text = '';
	statusBarItem.show();
	activeAsync();
}

async function activeAsync() {
	const liveshareOrNull = await vsls.getApi();
	
	if (!liveshareOrNull) {
		console.error('Error getting Live Share API');
		return;
	}
	liveshare = liveshareOrNull!;

	liveshare.onDidChangeSession(async (e: vsls.SessionChangeEvent) => {
		switch (e.session.role) {
			case vsls.Role.None:
				clearTimeout(updateRolesTimeout);
				break;
			case vsls.Role.Host:
				initHost();
				break;
			case vsls.Role.Guest:
				initGuest();
				break;
		}
	}, null, disposables);
}

async function initHost() {
	const service = await liveshare.shareService(SERVICE_NAME);
	if (!service) {
		console.error(`Could not proffer ${SERVICE_NAME} service to Live Share`);
		return;
	}
	
	function sendNotification() {
		const args: UpdateRolesEventArgs = {
			roles: getRolesDictionary(),
		};
		service!.notify(NOTIFICATION_NAME, args);
		setRole(args.roles[0]);
	}

	function tick() {
		rotateRoles();
		sendNotification();
		updateRolesTimeout = setTimeout(() => {
			tick();
		}, 4 * 60 * 1000);
	}
	
	addPeer(0);
	tick();
	
	liveshare.onDidChangePeers((e: vsls.PeersChangeEvent) => {
		peersChanged(e);
		sendNotification();
	}, null, disposables);
}

async function initGuest() {
	const service = await liveshare.getSharedService(SERVICE_NAME);
	if (service) {
		service!.onNotify(NOTIFICATION_NAME, (args: {}) => {
			setRole((<UpdateRolesEventArgs>args).roles[liveshare.session.peerNumber]);
		});
	}
}

function peersChanged(e: vsls.PeersChangeEvent) {
	for (const p of e.added) {
		addPeer(p.peerNumber);
	}
	for (const p of e.removed) {
		removePeer(p.peerNumber);
	}
}

function addPeer(peerNumber: number) {
	if (participants.indexOf(peerNumber) < 0) {
		participants.push(peerNumber);
	}
}

function removePeer(peerNumber: number) {
	participants.splice(participants.indexOf(peerNumber), 1);
}

function rotateRoles() {
	participants.push(participants.splice(0, 1)[0]);
}

function getRolesDictionary() {
	const rolesDictionary: RolesDictionary = {};
	for (let i = 0; i < participants.length; i++) {
		rolesDictionary[participants[i]] = userIndexToRole(i);
	}
	return rolesDictionary;
}

 function userIndexToRole(index: number): string {
	 switch (index) {
		 case 0: return ROLE_DRIVER;
		 case 1: return ROLE_NAVIGATOR;
		 default: return ROLE_MOB;
	 }
 }

 export function deactivate() {
	for (const disposable of disposables) {
		disposable.dispose();
	}
 }

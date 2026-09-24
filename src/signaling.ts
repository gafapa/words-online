// Serverless signaling: SDP descriptions are compressed into a compact
// string that users exchange manually (link, QR code or copy/paste).

const ICE_GATHERING_TIMEOUT_MS = 3000

// No STUN/TURN servers: only local (LAN) candidates are gathered,
// so no external service is ever contacted.
export const RTC_CONFIG: RTCConfiguration = { iceServers: [] }

export async function encodeDescription(desc: RTCSessionDescriptionInit): Promise<string> {
  const json = JSON.stringify({ t: desc.type === 'offer' ? 'o' : 'a', s: desc.sdp })
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function decodeDescription(code: string): Promise<RTCSessionDescriptionInit> {
  const b64 = code.trim().replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  const { t, s } = JSON.parse(await new Response(stream).text())
  return { type: t === 'o' ? 'offer' : 'answer', sdp: s }
}

// Waits until all ICE candidates are embedded in the local description,
// since there is no channel to trickle them later.
export function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', onChange)
      clearTimeout(timer)
      resolve()
    }
    const onChange = () => pc.iceGatheringState === 'complete' && done()
    const timer = setTimeout(done, ICE_GATHERING_TIMEOUT_MS)
    pc.addEventListener('icegatheringstatechange', onChange)
  })
}

// Host side: creates a peer connection and an offer code for one guest.
export async function createOffer(): Promise<{ pc: RTCPeerConnection; channel: RTCDataChannel; code: string }> {
  const pc = new RTCPeerConnection(RTC_CONFIG)
  const channel = pc.createDataChannel('yjs', { ordered: true })
  await pc.setLocalDescription(await pc.createOffer())
  await waitForIceGathering(pc)
  return { pc, channel, code: await encodeDescription(pc.localDescription!) }
}

// Host side: completes the handshake with the guest's answer code.
export async function acceptAnswer(pc: RTCPeerConnection, answerCode: string): Promise<void> {
  const answer = await decodeDescription(answerCode)
  if (answer.type !== 'answer') throw new Error('The code is not an answer code')
  await pc.setRemoteDescription(answer)
}

// Guest side: consumes an offer code and produces an answer code.
export async function createAnswer(
  offerCode: string,
): Promise<{ pc: RTCPeerConnection; channel: Promise<RTCDataChannel>; code: string }> {
  const offer = await decodeDescription(offerCode)
  if (offer.type !== 'offer') throw new Error('The code is not an invitation code')
  const pc = new RTCPeerConnection(RTC_CONFIG)
  const channel = new Promise<RTCDataChannel>((resolve) => {
    pc.addEventListener('datachannel', (e) => resolve(e.channel), { once: true })
  })
  await pc.setRemoteDescription(offer)
  await pc.setLocalDescription(await pc.createAnswer())
  await waitForIceGathering(pc)
  return { pc, channel, code: await encodeDescription(pc.localDescription!) }
}

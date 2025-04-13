'use server';

class VideoUnavailableError extends Error {
  constructor(videoId: string) {
    super(`The video is no longer available (${videoId})`);
    this.name = 'VideoUnavailableError';
  }
}

class TranscriptDisabledError extends Error {
  constructor(videoId: string) {
    super(`Transcript is disabled on this video (${videoId})`);
    this.name = 'TranscriptDisabledError';
  }
}

class TooManyRequestsError extends Error {
  constructor() {
    super('Too many requests to YouTube from this IP. Captcha solving required.');
    this.name = 'TooManyRequestsError';
  }
}

class TranscriptNotAvailableError extends Error {
  constructor(videoId: string) {
    super(`No transcripts are available for this video (${videoId})`);
    this.name = 'TranscriptNotAvailableError';
  }
}

class LanguageNotAvailableError extends Error {
  constructor(videoId: string, lang: string, availableLangs: string[]) {
    super(
      `No transcripts available in "${lang}" for this video (${videoId}). Available languages: ${availableLangs.join(
        ', '
      )}`
    );
    this.name = 'LanguageNotAvailableError';
  }
}

const YOUTUBE_VIDEO_ID_LENGTH = 11;
const YOUTUBE_VIDEO_URL = 'https://www.youtube.com/watch?v=';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_4) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36,gzip(gfe)';
const RE_YOUTUBE =
  /(?:youtube\.com\/(?:[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?/\s]{11})/i;
const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

interface TranscriptConfig {
  lang?: string;
}

interface TranscriptResponse {
  text: string;
  duration: number;
  offset: number;
  lang: string;
}

interface CaptionsData {
  playerCaptionsTracklistRenderer: PlayerCaptionsTracklistRenderer;
}

interface PlayerCaptionsTracklistRenderer {
  captionTracks: CaptionTrack[];
}

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name?: { simpleText: string };
  vssId?: string;
  kind?: string;
  isTranslatable?: boolean;
}

interface Thumbnail {
  thumbnails: { url: string }[];
}

interface SimpleText {
  simpleText: string;
}

interface YouTubeVideoDetailsData {
  videoId: string;
  title: string;
  author: string;
  shortDescription: string;
  thumbnail: Thumbnail;
  publishDate?: string;
  keywords?: string[];
  lengthSeconds?: string;
  viewCount?: string;
  isLiveContent?: boolean;
}

interface PlayerMicroformatRenderer {
  publishDate?: string;
  uploadDate?: string;
  ownerChannelName?: string;
  category?: string;
  viewCount?: string;
  lengthSeconds?: string;
}

interface PlayerMicroformat {
  playerMicroformatRenderer: PlayerMicroformatRenderer;
}

interface YouTubePlayerResponse {
  videoDetails: YouTubeVideoDetailsData;
  captions?: CaptionsData;
  microformat?: PlayerMicroformat;
}

interface VideoDetails {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  keywords?: string[];
  lengthSeconds?: string;
  viewCount?: string;
  captionsData: CaptionsData;
  transcript: TranscriptResponse[];
}

function retrieveVideoId(videoId: string): string {
  if (videoId.length === YOUTUBE_VIDEO_ID_LENGTH) return videoId;

  const match = RE_YOUTUBE.exec(videoId);
  if (match?.[1]) return match[1];

  throw new Error('Unable to retrieve YouTube video ID.');
}

async function fetchVideoPage(videoId: string, lang?: string): Promise<string> {
  try {
    const response = await fetch(`${YOUTUBE_VIDEO_URL}${videoId}`, {
      headers: {
        ...(lang && { 'Accept-Language': lang }),
        'User-Agent': USER_AGENT,
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new TooManyRequestsError();
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.text();
  } catch (error: unknown) {
    if (error instanceof TooManyRequestsError) {
      throw error;
    }
    
    if (error instanceof Error) {
      throw new Error(`Failed to fetch video page (${videoId}): ${error.message}`);
    }
    throw new Error(`Failed to fetch video page (${videoId}): An unknown error occurred`);
  }
}

function parseInitialPlayerResponse(body: string): YouTubePlayerResponse {
  const initialPlayerResponseMatch = /ytInitialPlayerResponse\s*=\s*(\{.*?\});/s.exec(body);

  if (!initialPlayerResponseMatch?.[1]) {
    if (body.includes('class="g-recaptcha"')) {
      throw new TooManyRequestsError();
    }
    if (!body.includes('"playabilityStatus":')) {
        throw new VideoUnavailableError('Unknown ID - Check parseInitialPlayerResponse');
    }
    throw new Error('Failed to extract initial player response');
  }

  try {
    const playerResponse: YouTubePlayerResponse = JSON.parse(initialPlayerResponseMatch[1]);
    if (!playerResponse.videoDetails) {
        throw new Error('Video details not found in initial player response');
    }
    return playerResponse;
  } catch (error: unknown) {
    throw new Error(`Failed to parse initial player response JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function parseVideoBaseDetails(playerResponse: YouTubePlayerResponse): Omit<VideoDetails, 'transcript' | 'videoId' | 'captionsData'> {
    const { videoDetails, microformat } = playerResponse;

    const microformatRenderer = microformat?.playerMicroformatRenderer;

    const {
        title,
        author,
        shortDescription: description,
        thumbnail,
        publishDate,
        keywords,
        lengthSeconds,
        viewCount,
    } = videoDetails;

    const publishedAt = microformatRenderer?.publishDate || microformatRenderer?.uploadDate || publishDate || 'Date not available';

    const channelTitle = microformatRenderer?.ownerChannelName || author || 'Channel not available';

    const thumbnails = thumbnail?.thumbnails;
    const thumbnailUrl = thumbnails?.[thumbnails.length - 1]?.url || '';

    return {
        title,
        channelTitle,
        description,
        thumbnailUrl,
        publishedAt,
        keywords,
        lengthSeconds,
        viewCount,
    };
}

function getCaptionsData(playerResponse: YouTubePlayerResponse, videoId: string): CaptionsData {
    const captions = playerResponse.captions;

    if (!captions) {
        throw new TranscriptDisabledError(videoId);
    }

    if (!captions.playerCaptionsTracklistRenderer || !captions.playerCaptionsTracklistRenderer.captionTracks) {
        throw new TranscriptNotAvailableError(videoId);
    }

    return captions;
}

function getAvailableLanguages(captionsData: CaptionsData): string[] {
  const tracks = captionsData.playerCaptionsTracklistRenderer.captionTracks;
  return Array.isArray(tracks) ? tracks.map((track) => track.languageCode) : [];
}

function selectTranscriptTrack(
  captionsData: CaptionsData,
  videoId: string,
  lang?: string
): CaptionTrack {
  const captionTracks = captionsData.playerCaptionsTracklistRenderer.captionTracks;

  if (!captionTracks || captionTracks.length === 0) {
    throw new TranscriptNotAvailableError(videoId);
  }

  let track: CaptionTrack | undefined;

  if (lang) {
    const availableLangs = getAvailableLanguages(captionsData);
    track = captionTracks.find((t) => t.languageCode === lang);

    if (!track) {
      throw new LanguageNotAvailableError(videoId, lang, availableLangs);
    }
  } else {
    track = captionTracks[0];
  }

  if (!track) {
    throw new TranscriptNotAvailableError(videoId);
  }

  return track;
}

async function fetchTranscriptData(transcriptUrl: string): Promise<string> {
  const response = await fetch(transcriptUrl, {
    headers: {
      'User-Agent': USER_AGENT,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch transcript data. Status: ${response.status}`);
  }

  return response.text();
}

function parseTranscriptXML(transcriptBody: string, lang: string): TranscriptResponse[] {
  const matches = Array.from(transcriptBody.matchAll(RE_XML_TRANSCRIPT));

  if (!matches.length && transcriptBody.trim() !== '') {
     console.warn('Transcript body not empty but failed to parse XML matches.');
  }

  if (matches.length === 0) {
    return [];
  }

  return matches.map((match) => {
    const [, start = '0', duration = '0', text = ''] = match;

    const decodedText = text
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>');

    return {
      text: decodedText.trim(),
      duration: parseFloat(duration),
      offset: parseFloat(start),
      lang,
    };
  });
}

async function fetchVideoDetails(
  videoId: string,
  config?: TranscriptConfig
): Promise<VideoDetails> {
  try {
    const id = retrieveVideoId(videoId);
    const body = await fetchVideoPage(id, config?.lang);

    const playerResponse = parseInitialPlayerResponse(body);

    const baseDetails = parseVideoBaseDetails(playerResponse);

    const captionsData = getCaptionsData(playerResponse, id);

    const transcriptTrack = selectTranscriptTrack(captionsData, id, config?.lang);

    const transcriptBody = await fetchTranscriptData(transcriptTrack.baseUrl);
    const transcriptResponses = parseTranscriptXML(transcriptBody, transcriptTrack.languageCode);

    const fullVideoDetails: VideoDetails = {
      videoId: id,
      ...baseDetails,
      captionsData: captionsData,
      transcript: transcriptResponses,
    };

    return fullVideoDetails;

  } catch (error: unknown) {
    if (
      error instanceof VideoUnavailableError ||
      error instanceof TranscriptDisabledError ||
      error instanceof TooManyRequestsError ||
      error instanceof TranscriptNotAvailableError ||
      error instanceof LanguageNotAvailableError
    ) {
      throw error;
    }

    if (error instanceof Error) {
        throw new Error(`Failed to fetch video details for ${videoId}: ${error.message}`);
    }

    throw new Error(`Failed to fetch video details for ${videoId}: An unknown error occurred`);
  }
}

export function formatTranscript(transcriptData: TranscriptResponse[]): string {
  if (!transcriptData || !Array.isArray(transcriptData) || transcriptData.length === 0) {
    return ""; // Return empty string for invalid input
  }

  let formattedTranscript = "";
  let previousSegment: TranscriptResponse | null = null;

  for (const segment of transcriptData) {
    let text = segment.text;

    // 1. Basic Text Cleaning:
    text = text.trim(); // Remove leading/trailing whitespace

    // 2. HTML Entity Decoding:
    text = text.replace(/&amp;#39;/g, "'"); // Replace &#39; with '
    text = text.replace(/&quot;/g, '"');   // Replace the double quote HTML entity
    text = text.replace(/&lt;/g, '<');     // Replace less than HTML entity
    text = text.replace(/&gt;/g, '>');     // Replace greater than HTML entity
    text = text.replace(/&amp;/g, '&');    // Replace &amp; with &  (MUST be last)

    // 3. Sentence Case and Punctuation:
    if (formattedTranscript.length > 0 && previousSegment) {
        // Add a space if the previous segment didn't end with punctuation.
        const lastChar = formattedTranscript.slice(-1);
        if (!['.', '?', '!', '\n'].includes(lastChar)) {
              // Check if a pause of greater than 0.5 seconds occurs
              if(segment.offset - (previousSegment.offset + previousSegment.duration) > 0.5){
                  formattedTranscript += "\n\n";
              }
              else{
                  formattedTranscript += " ";
              }
        }
    }

    // Capitalize the first letter of the *segment* (if it's the start of the whole transcript OR after a newline).
    if (formattedTranscript.length === 0 || formattedTranscript.slice(-2) === '\n\n' ) {
       // Ensure text is not empty before capitalizing
       if (text.length > 0) {
         text = text.charAt(0).toUpperCase() + text.slice(1);
       }
    }

    formattedTranscript += text;
    previousSegment = segment; // Update previous segment for next iteration
  }

    // Add final punctuation if missing. Makes the transcript end nicely.
    const lastChar = formattedTranscript.slice(-1);
    if (formattedTranscript.length > 0 && !['.', '?', '!', '\n'].includes(lastChar)) {
        formattedTranscript += '.';
    }

  return formattedTranscript;
}

export {
  fetchVideoDetails,
  VideoUnavailableError,
  TranscriptDisabledError,
  TooManyRequestsError,
  TranscriptNotAvailableError,
  LanguageNotAvailableError,
};

export type { VideoDetails, CaptionsData, CaptionTrack, TranscriptResponse, TranscriptConfig }; 
import { fetchVideoDetails, formatTranscript } from './fetchTranscript'; // Adjusted import path

const videoId = 'Blx0roWAsFQ'; // Example video ID
// const videoId = 'dQw4w9WgXcQ'; // Example with no transcript
// const videoId = 'invalidVideoId'; // Example invalid ID

console.log(`Fetching details for video: ${videoId}...`);

fetchVideoDetails(videoId)
  .then(details => {
    console.log('\n--- Video Details ---');
    console.log(`Title: ${details.title}`);
    console.log(`Channel: ${details.channelTitle}`);
    console.log(`Published: ${details.publishedAt}`);
    console.log(`Thumbnail: ${details.thumbnailUrl}`);
    // console.log(`Description: ${details.description}`); // Often long, uncomment if needed
    // console.log(`Available Languages: ${details.captionsData.playerCaptionsTracklistRenderer.captionTracks.map(t => t.languageCode).join(', ')}`); // Log available languages if needed

    console.log('\n--- Formatted Transcript Segments ---'); // Renamed section
    if (details.transcript.length > 0) {
        console.log(`Language: ${details.transcript[0].lang}`);
        console.log(`Segments: ${details.transcript.length}`);
        // Log first few segments in the desired format
        for (const segment of details.transcript.slice(0, 5)) {
             console.log(`[${segment.offset.toFixed(2)}s - ${(segment.offset + segment.duration).toFixed(2)}s] ${segment.text}`);
        }
        if (details.transcript.length > 5) {
            console.log('...');
        }
    } else {
        console.log('No transcript segments found to format.');
    }

    console.log('\n--- Formatted Transcript Text ---'); // New section
    const formattedText = formatTranscript(details.transcript);
    if (formattedText) {
        console.log(formattedText);
    } else {
        console.log('No transcript data to format into text.');
    }

  })
  .catch(err => {
    console.error('\n--- Error Fetching Details ---');
    console.error(err);
  }); 
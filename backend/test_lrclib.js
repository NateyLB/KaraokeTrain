fetch('https://lrclib.net/api/search?track_name=Speed+Demon&artist_name=Justin+Bieber')
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data, null, 2)))
  .catch(err => console.error(err));

fetch('http://localhost:3000/api/separate/start?videoId=dQw4w9WgXcQ&title=Rick&artist=Astley', {
  method: 'POST'
}).then(res => res.json()).then(console.log).catch(console.error);

fetch('http://localhost:3000/api/separate/start?videoId=vD1bemWtjUU&title=Test&artist=Test', {
  method: 'POST'
}).then(res => res.json()).then(console.log).catch(console.error);

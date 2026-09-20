const id = 'dQw4w9WgXcQ';
const poll = () => {
  fetch(`http://localhost:3000/api/separate/status?jobId=${id}`)
    .then(res => res.json())
    .then(data => {
      console.log(data);
      if (data.status !== 'error' && data.status !== 'ready') {
        setTimeout(poll, 2000);
      }
    });
};
poll();

let isPosting = false;

const socket = io(window.location.href);

socket.on('id', (id) => {
  $('[name="socketID"]').attr('value', id);
});

const loading = (() => {
  let message = 'Logging in';
  let elipsisNum = 0;
  let intervalID;

  socket.on('updateProgress', (update) => {
    $('#loading .text').text(update);
  });

  return {
    start: () => {
      elipsisNum = 0;
      $('#loading .text').text(message);
      intervalID = setInterval(() => {
        $('#loading .text').removeClass(`elipsis${elipsisNum}`);
        elipsisNum = (elipsisNum + 1) % 4;
        $('#loading .text').addClass(`elipsis${elipsisNum}`);
      }, 1000);
    },
    stop: () => {
      clearInterval(intervalID);
      $('#loading .text').text('');
      $('#loading .text').removeClass(`elipsis${elipsisNum}`);
    },
  };
})();

$('form').on('submit', async function (e) {
  e.preventDefault();
  if (isPosting) return;
  loading.start();
  isPosting = true;
  $('#error').text('');
  $('#success').text('');
  const data = new FormData(this);
  const body = {};
  data.forEach((v, k) => (body[k] = v));
  $('input').attr('disabled', '');
  const res = await fetch('/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status >= 400) {
    const data = await res.json();
    $('#error').text(data.error);
  } else {
    const blob = await res.blob();
    const a = document.createElement('a');
    const url = window.URL.createObjectURL(blob);
    a.href = url;
    a.download = res.headers
      .get('Content-Disposition')
      .split('filename=')[1]
      .replace(/"/g, '');
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    $('#success').text('Creation successful!');
  }
  $('input').removeAttr('disabled');
  loading.stop();
  isPosting = false;
});

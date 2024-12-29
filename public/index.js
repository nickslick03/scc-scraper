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
    message = update;
    resetElipsis();
  });

  const elipsisControl = {
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
    setMessage: (msg) => {
      message = msg;
      $('#loading .text').text(message);
    },
  };

  function resetElipsis() {
    elipsisControl.stop();
    elipsisControl.start();
  }

  return elipsisControl;
})();

$('form').on('submit', async function (e) {
  e.preventDefault();
  if (isPosting) return;
  loading.start();
  isPosting = true;
  $('#error').text('');
  $('#success').text('');
  const body = new URLSearchParams(new FormData(this));
  $('input').attr('disabled', '');
  loading.setMessage('Logging in');
  try {
    const res = await fetch(location.href, {
      method: 'POST',
      body,
    });
    if (!res.ok) {
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
  } catch (e) {
    console.log(e);
    $('#error').text('Failed. Please try a different browser or again later.');
  } finally {
    $('input').removeAttr('disabled');
    loading.stop();
    isPosting = false;
  }
});

(async () => {
  try {
    const res = await fetch(location.href, { method: 'PUT' });
    const text = await res.text();
    console.log(text);
  } catch (e) {
    console.error(e);
  }
})();

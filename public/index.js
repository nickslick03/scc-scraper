let isPosting = false;

const loading = (() => {
    const message = 'Generating Logs';
    let elipsis = '';
    let intervalID;
    return {
        start: () => {
            elipsis = '';
            $('#loading').text(message);
            intervalID = setInterval(() => {
                elipsis = elipsis.length === 3
                    ? ''
                    : elipsis + '.';
                $('#loading').text(message + elipsis);
            }, 1000);
        },
        stop: () => {
            clearInterval(intervalID);
            $('#loading').text('');
        }
    }
})();

$('form').on('submit', async function(e) {
    e.preventDefault();
    if (isPosting) return;
    loading.start();
    isPosting = true;
    $('#error').text('');
    $('#success').text('');
    const data = new FormData(this);
    const body = {};
    data.forEach((v, k) => body[k] = v);
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
        a.download = res.headers.get('Content-Disposition').split('filename=')[1].replace(/"/g, '');
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
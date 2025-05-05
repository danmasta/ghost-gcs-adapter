import GCSAdapter from '../lib/adapter.mjs';

describe('Adapter', () => {

    it('sanitize', () => {
        expect(gcs.sanitize('açaí à la carte')).to.equal('acai-a-la-carte');
        expect(gcs.sanitize('Bayern München')).to.equal('bayern-munchen');
    });

    it('fromURL', () => {
        let bucket = 'BUCKET';
        let gcs = new GCSAdapter({
            bucket
        });
        let file = gcs.fromURL('http://localhost:2368/content/images/2025/05/logo.png');
        expect(file.relative()).to.equal('images/2025/05/logo.png');
        file = gcs.fromURL('/content/images/2025/05/logo.png');
        expect(file.relative()).to.equal('images/2025/05/logo.png');
        gcs = new GCSAdapter({
            bucket,
            prefix: 'ghost',
            addPrefixToURL: true
        });
        file = gcs.fromURL(`https://${bucket}.storage.googleapis.com/ghost/2025/05/logo.png`);
        expect(file.relative()).to.equal('ghost/images/2025/05/logo.png');
        gcs = new GCSAdapter({
            bucket,
            prefix: 'ghost',
            addPrefixToURL: true,
            virtual: false
        });
        file = gcs.fromURL(`https://storage.googleapis.com/${bucket}/ghost/images/2025/05/logo.png`);
        expect(file.relative()).to.equal('ghost/images/2025/05/logo.png');
    });

});

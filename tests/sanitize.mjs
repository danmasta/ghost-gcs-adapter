describe('Sanitize', () => {

    it('remove diacritic marks', () => {
        expect(gcs.sanitize('açaí à la carte')).to.equal('acai-a-la-carte');
        expect(gcs.sanitize('Bayern München')).to.equal('bayern-munchen');
    });

});

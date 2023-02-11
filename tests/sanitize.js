describe('sanitize', () => {

    it('should remove diacritic marks', () => {
        expect(adapter.sanitize('açaí à la carte')).to.equal('acai-a-la-carte');
        expect(adapter.sanitize('Bayern München')).to.equal('Bayern-Munchen');
    });

});

import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeCSubmission } from '../server/agent/codeReview.js'

const bubble = `#include <stdio.h>
void bubbleSort(int a[], int n) { for(int i=0;i<n-1;i++) for(int j=0;j<n-i-1;j++) if(a[j]>a[j+1]) { int temp=a[j]; a[j]=a[j+1]; a[j+1]=temp; } }
int main(void){int a[5]={5,4,3,2,1}; bubbleSort(a,5); return 0;}`

test('C submission review identifies a bubble-sort pattern and returns 15 metrics', () => {
  const r = analyzeCSubmission({ question: 'Sort 5000 numbers in ascending order', code: bubble })
  assert.equal(r.status, 'analyzed')
  assert.match(r.detected.name, /Bubble Sort/)
  assert.equal(r.metrics.length, 15)
  assert.equal(r.recommendation.name, 'Merge Sort')
  assert.equal(r.agents.length, 5)
})

test('review flags common unsafe C patterns', () => {
  const r = analyzeCSubmission({ question: 'Sort numbers', code: '#include <stdio.h>\nvoid main(){ char x[20]; gets(x); }' })
  assert.ok(r.issues.some(x => x.includes('gets()')))
  assert.ok(r.issues.some(x => x.includes('void main')))
})

test('review requires both question and code', () => {
  assert.throws(() => analyzeCSubmission({ question: '', code: 'int main(){return 0;}' }), /required/)
})
